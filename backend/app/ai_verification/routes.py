import tempfile
import shutil
import os
import re
import uuid
import json
import logging
import pathlib
import pdfplumber
import csv
from sqlalchemy import select
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Form, File, UploadFile
from sqlalchemy.orm import Session
from app.core.database import get_session
from langgraph.graph import StateGraph, END, START

from app.ai_verification.schemas import VerificationApiResponse
from app.campaigns.models import Campaign, Contribution
from app.ai_verification.services import CONFIG, EnterpriseWorkflowManager as AIVerificationWorkflowManager


router = APIRouter(
    prefix="/ai-verification",
    tags=["AI Verification"]
)


logger = logging.getLogger(__name__)


def _find_first_non_empty_paragraph(text_content: str) -> str:
    """
    Finds the first non-empty block of text separated by blank lines.
    A blank line is considered one or more newline characters, possibly with whitespace.
    """
    if not text_content:
        return ""

    # Normalize different newline characters to \n
    normalized_text = text_content.replace('\r\n', '\n').replace('\r', '\n')
    
    # Split by one or more occurrences of newlines that constitute a blank line.
    # This regex splits by sequences of \n that might have whitespace between them,
    # effectively splitting by "blank lines".
    paragraphs = re.split(r'\n\s*\n', normalized_text)
    
    for p_text in paragraphs:
        stripped_p = p_text.strip()
        if stripped_p:
            return stripped_p # Return the first non-empty paragraph
            
    return normalized_text.strip()


def extract_text_to_temp_file(original_file_path: str, original_filename: str, temp_dir_path: str) -> str:
    """
    Extracts a portion of text (first paragraph for TXT/PDF, first line for CSV)
    and saves it to a new temporary text file.

    Args:
        original_file_path: Path to the originally uploaded (and saved) file.
        original_filename: The original name of the uploaded file.
        temp_dir_path: The directory where the new temporary text file should be created.

    Returns:
        Path to the new temporary file containing extracted text if successful and applicable,
        otherwise returns the original_file_path.
    """
    file_extension = pathlib.Path(original_filename).suffix.lower()
    extracted_portion = "" # Changed variable name for clarity
    extraction_done = False

    # Ensure a unique filename for the extracted content to avoid collisions if this function
    # were ever called multiple times in a way that `temp_dir_path` isn't unique per call.
    # The UUID ensures this.
    new_temp_text_file_path = os.path.join(temp_dir_path, f"extracted_portion_{uuid.uuid4().hex}.txt")

    try:
        if file_extension == ".txt":
            with open(original_file_path, "r", encoding="utf-8", errors="replace") as f:
                full_text = f.read()
            extracted_portion = _find_first_non_empty_paragraph(full_text)
            extraction_done = True
            logger.info(f"Extracted first paragraph from TXT file: {original_filename}")

        elif file_extension == ".pdf":
            text_from_first_page = ""
            with pdfplumber.open(original_file_path) as pdf:
                if pdf.pages: # Check if there are any pages
                    first_page = pdf.pages[0]
                    # extract_text() can return None if page has no text or is image-based
                    text_from_first_page = first_page.extract_text() or "" 
            extracted_portion = _find_first_non_empty_paragraph(text_from_first_page)
            extraction_done = True
            logger.info(f"Extracted first paragraph from PDF file's first page: {original_filename}")

        elif file_extension == ".csv":
            with open(original_file_path, "r", newline='', encoding="utf-8", errors="replace") as csvfile:
                reader = csv.reader(csvfile)
                try:
                    first_row = next(reader)
                    extracted_portion = ",".join(first_row) # Join cells of the first row
                except StopIteration: # Handles empty CSV file
                    extracted_portion = "" 
            extraction_done = True
            logger.info(f"Extracted first line from CSV file: {original_filename}")

        else:
            # Not a file type we're extracting text from, use original.
            logger.info(f"File type '{file_extension}' not designated for partial text extraction. Using original file.")
            return original_file_path

        # Save extracted portion to the new temp file, even if it's empty
        if extraction_done:
            with open(new_temp_text_file_path, "w", encoding="utf-8") as f:
                f.write(extracted_portion)
            logger.info(f"Saved extracted portion to: {new_temp_text_file_path}. Length: {len(extracted_portion)} chars.")
            return new_temp_text_file_path

    except Exception as e:
        logger.error(f"Error during partial text extraction for {original_filename} (type {file_extension}): {e}", exc_info=True)
        # Fallback to original file path if extraction fails
        return original_file_path
    
    # Fallback in case logic somehow bypasses other returns (should not happen with current structure)
    return original_file_path



@router.post("/verify-submission", response_model=VerificationApiResponse)
async def verify_submission_endpoint(
    onchain_campaign_id: str = Form(...),
    wallet_address: str = Form(...),
    submission_file: UploadFile = File(...),
    db: Session = Depends(get_session)
):
    if not AIVerificationWorkflowManager:
        raise HTTPException(status_code=503, detail="Verification service is not properly initialized.")

    logger.info(f"Received submission for campaign '{onchain_campaign_id}' from wallet '{wallet_address}'. File: {submission_file.filename}")

    data_verification_workflow_v2: Dict[str, Any] = {
        "name": "AthenaV2",
        "agent_configs": [
            {
                "name": "FileProcessorAgent",
                "system_message_template": (
                    "You are the File Processor Agent ({agent_name}) for node '{node_id}'. Your current task is to process the file specified in '{submitted_data_path}'.\n"
                    "Your previous action might have been to call the 'read_file_content' tool. If you see a ToolMessage in the history with its output, proceed to Step 2. Otherwise, start at Step 1.\n\n"
                    "Step 1: Initial Tool Call\n"
                    "If you have not yet called 'read_file_content' for '{submitted_data_path}', your **only action** is to call the 'read_file_content' tool with `file_path` set to the value of '{submitted_data_path}'. Your response will be an AIMessage with this single tool call. Do not add any other commentary.\n\n"
                    "Step 2: Process Tool Result and Update Scratchpad\n"
                    "You have received a ToolMessage with JSON output from 'read_file_content'. Analyze its 'type', 'content', 'content_disposition', and 'message' fields.\n"
                    "Your ONLY job now is to prepare a JSON response for the scratchpad. Do NOT call any tools.\n"
                    "Your AIMessage `content` field must be ONLY a JSON string, structured exactly as required.\n"
                    "Based on the tool's output:\n\n"
                    "1. If 'type' is 'image' and 'content_disposition' is 'filepath':\n"
                    "   The 'scratchpad_updates' object in your JSON response should contain:\n"
                    "   `\"image_file_to_verify\": \"<path_from_tool_content_field>\",`\n"
                    "   `\"{node_id}_route_to\": \"IMAGE_READY_FOR_SCORING\"`\n\n"
                    "2. If 'type' is 'text':\n"
                    "   a. If 'content_disposition' is 'inline':\n"
                    "      The 'scratchpad_updates' object in your JSON response should contain:\n"
                    "      `\"text_content_to_verify\": \"<text_from_tool_content_field_escaped_as_json_string>\",`\n"
                    "      `\"text_content_source_type\": \"inline\",`\n"
                    "      `\"{node_id}_route_to\": \"TEXT_READY_FOR_SCORING\"`\n"
                    "      (Ensure the <text_from_tool_content_field...> is properly escaped as a valid JSON string value, including handling newlines as \\\\n and quotes as \\\".)\n"
                    "   b. If 'content_disposition' is 'filepath':\n"
                    "      The 'scratchpad_updates' object in your JSON response should contain:\n"
                    "      `\"text_content_path_to_verify\": \"<path_from_tool_content_field>\",`\n"
                    "      `\"text_content_source_type\": \"filepath\",`\n"
                    "      `\"{node_id}_route_to\": \"TEXT_READY_FOR_SCORING\"`\n\n"
                    "3. If 'type' is 'binary', 'unknown', or 'content_disposition' is 'notsupported' or 'truncated':\n"
                    "   The 'scratchpad_updates' object in your JSON response should contain:\n"
                    "   `\"unsupported_file_details\": {{ \"original_path\": \"<original_file_path>\", \"type\": \"<tool_type>\", \"message\": \"<tool_message>\" }},`\n"
                    "   `\"{node_id}_route_to\": \"VERIFICATION_HALTED\"`\n\n"
                    "4. If 'type' is 'error':\n"
                    "   The 'scratchpad_updates' object in your JSON response should contain:\n"
                    "   `\"file_processing_error\": \"<tool_message>\",`\n"
                    "   `\"{node_id}_route_to\": \"VERIFICATION_HALTED\"`\n\n"
                    "Construct your AIMessage content as a single JSON object string like this example (choose one case and fill in the details):\n"
                    "```json\n"
                    "{{\n"
                    "  \"thought\": \"Brief thought based on the tool output. For example: Tool output indicates a text file was read and content is provided as a filepath.\",\n"
                    "  \"scratchpad_updates\": {{\n"
                    "    \"text_content_path_to_verify\": \"/tmp/xyz123.txt\",\n"
                    "    \"text_content_source_type\": \"filepath\",\n"
                    "    \"{node_id}_route_to\": \"TEXT_READY_FOR_SCORING\"\n"
                    "  }}\n"
                    "}}\n"
                    "```\n"
                    "**CRITICAL**: Your entire AIMessage `content` must be *only* the JSON string as shown in the example structure. Do NOT wrap it in any other text or Markdown unless it's part of a string value within the JSON. No `tool_calls` in your AIMessage."
                ),
                "llm_choice": "google",
                "allowed_tools": ["read_file_content"]
            },
            {
                "name": "AIVerificationScorerAgent",
                "system_message_template": (
                    "You are the AI Verification Scorer Agent ({agent_name}) for node '{node_id}'. Your task is to obtain a verification score for the data provided in the scratchpad.\n"
                    "Campaign Details: Description='{campaign_campaign_description}', Requirements='{campaign_campaign_data_requirements}'. Wallet: '{wallet_address}'.\n"
                    "Your previous action might have been to call a scoring tool. If you see a ToolMessage in the history with its output, proceed to Step 2. Otherwise, start at Step 1.\n\n"
                    "Step 1: Initial Tool Call (Check Scratchpad)\n"
                    "Your goal is to determine if you have enough information from the scratchpad to call a scoring tool. Examine the scratchpad for the following keys in this order of preference:\n\n"
                    "1.  **For Images**:\n"
                    "    * If `image_file_to_verify` (a file path string) is present in the scratchpad:\n"
                    "        Your **only action** is to call the 'get_image_verification_score' tool. Use these exact arguments:\n"
                    "        * `file_path`: the value of `image_file_to_verify` from the scratchpad.\n"
                    "        * `campaign_description`: '{campaign_campaign_description}'\n"
                    "        * `campaign_requirements`: '{campaign_campaign_data_requirements}'\n"
                    "        * `wallet_address`: '{wallet_address}'\n"
                    "        Your response must be an AIMessage with only this single tool call. Do not add any other commentary.\n\n"
                    "2.  **For Text (from a file path)**:\n"
                    "    * Else if `text_content_source_type` in the scratchpad is the string 'filepath' AND `text_content_path_to_verify` (a file path string) is also present:\n"
                    "        Your **only action** is to call the 'get_text_verification_score' tool. Use these exact arguments:\n"
                    "        * `content_path`: the value of `text_content_path_to_verify` from the scratchpad.\n"
                    "        * `campaign_description`: '{campaign_campaign_description}'\n"
                    "        * `campaign_requirements`: '{campaign_campaign_data_requirements}'\n"
                    "        * `wallet_address`: '{wallet_address}'\n"
                    "        * `llm_choice`: 'google'\n"
                    "        Your response must be an AIMessage with only this single tool call. Do not add any other commentary.\n\n"
                    "3.  **For Text (inline content)**:\n"
                    "    * Else if `text_content_source_type` in the scratchpad is the string 'inline' AND `text_content_to_verify` (the actual text string) is also present:\n"
                    "        Your **only action** is to call the 'get_text_verification_score' tool. Use these exact arguments:\n"
                    "        * `content`: the value of `text_content_to_verify` from the scratchpad.\n"
                    "        * `campaign_description`: '{campaign_campaign_description}'\n"
                    "        * `campaign_requirements`: '{campaign_campaign_data_requirements}'\n"
                    "        * `wallet_address`: '{wallet_address}'\n"
                    "        * `llm_choice`: 'google'\n"
                    "        Your response must be an AIMessage with only this single tool call. Do not add any other commentary.\n\n"
                    "4.  **If None of the Above Conditions are Met**:\n"
                    "    * If you cannot find the necessary information (`image_file_to_verify`, or `text_content_path_to_verify` with `text_content_source_type` as 'filepath', or `text_content_to_verify` with `text_content_source_type` as 'inline') for any of the above tool calls:\n"
                    "        Your **only action** is to prepare a JSON response for the scratchpad to indicate an error. Do NOT call any tools.\n"
                    "        Your AIMessage `content` field must be ONLY a JSON string, structured like this:\n"
                    "        ```json\n"
                    "        {{\n"
                    "          \"thought\": \"Cannot proceed with scoring as required data (image path, text content, or text path along with its source type) is missing from the scratchpad.\",\n"
                    "          \"scratchpad_updates\": {{\n"
                    "            \"scoring_error\": \"Prerequisite data for scoring (e.g., image_file_to_verify, text_content_to_verify, or text_content_path_to_verify with correct text_content_source_type) not found in scratchpad.\",\n"
                    "            \"verification_score\": 0.0,\n"
                    "            \"{node_id}_route_to\": \"VERIFICATION_HALTED\"\n"
                    "          }}\n"
                    "        }}\n"
                    "        ```\n"
                    "        Your AIMessage must not contain any `tool_calls`.\n\n"
                    "Step 2: Process Tool Result and Update Scratchpad\n"
                    "You have received a ToolMessage with the JSON output from the scoring tool. **Your ONLY job now is to prepare a JSON response for the scratchpad. Do NOT call any tools.**\n"
                    "Your AIMessage `content` field **must be ONLY a JSON string**, structured exactly like this:\n"
                    "```json\n"
                    "{{\n"
                    "  \"thought\": \"Briefly describe your thought process for updating the scratchpad based on the tool's output.\",\n"
                    "  \"scratchpad_updates\": {{\n"
                    "    \"verification_score\": <ACTUAL_NUMERIC_SCORE_FROM_TOOL>,\n"
                    "    \"{node_id}_route_to\": \"SCORE_OBTAINED\"\n"
                    "  }}\n"
                    "}}\n"
                    "```\n"
                    "Replace `<ACTUAL_NUMERIC_SCORE_FROM_TOOL>` with the numeric score you extracted from the tool's JSON output (e.g., the value of 'score' for images, or 'final_score_adjusted' for text).\n"
                    "If the tool output indicated an error, or the score is 0 or implies an error (check the 'reasoning' field or score value from the tool output), your `scratchpad_updates` in the JSON above should instead be:\n"
                    "```json\n"
                    "{{\n"
                    "  \"scratchpad_updates\": {{\n" # Ensure scratchpad_updates is the key for the inner object
                    "    \"scoring_error\": \"Details of the error from the tool or a summary. For example, if the tool returned a score of 0 and reasoning indicated an API block.\",\n"
                    "    \"verification_score\": 0.0,\n"
                    "    \"{node_id}_route_to\": \"VERIFICATION_HALTED\"\n"
                    "  }}\n"
                    "}}\n"
                    "```\n"
                    "**CRITICAL: Your entire AIMessage `content` must be *only* this JSON string. Do not add any other text, commentary, or `tool_calls` to your AIMessage.**"
                ),
                "llm_choice": "google",
                "allowed_tools": ["get_image_verification_score", "get_text_verification_score"]
            },
            {
                "name": "DecisionMakerAgent",
                "system_message_template": (
                    "You are the Decision Maker Agent ({agent_name}) for node '{node_id}'. You have a 'verification_score' (e.g., {verification_score}) and a 'campaign_required_quality_score' (e.g., {campaign_required_quality_score}) from the scratchpad.\n"
                    "Your previous action might have been to call the 'make_verification_decision' tool. If you see a ToolMessage in the history with its output, proceed to Step 2. Otherwise, start at Step 1.\n\n"
                    "Step 1: Initial Tool Call\n"
                    "Your **only action** is to call the 'make_verification_decision' tool. Provide `verification_score` from scratchpad (use the value of '{verification_score}'). For `required_quality_score`, use the value from scratchpad key 'campaign_required_quality_score' (or default to 70.0 if 'campaign_required_quality_score' is missing or invalid).\n"
                    "Your response will be an AIMessage with this single tool call. Do not add any other commentary.\n\n"
                    "Step 2: Process Tool Result and Update Scratchpad\n"
                    "You have received a ToolMessage with the JSON decision object from 'make_verification_decision'. **Your ONLY job now is to prepare a JSON response for the scratchpad. Do NOT call any tools.**\n"
                    "Your AIMessage `content` field **must be ONLY a JSON string**, structured exactly like this:\n"
                    "```json\n"
                    "{{\n"
                    "  \"thought\": \"Briefly describe your thought process for incorporating the tool's decision into the scratchpad.\",\n"
                    "  \"scratchpad_updates\": {{\n"
                    "    \"final_verification_decision_json\": \"<THE_ENTIRE_JSON_STRING_FROM_THE_TOOL_OUTPUT_ESCAPED>\",\n"
                    "    \"{node_id}_route_to\": \"DECISION_MADE\"\n"
                    "  }}\n"
                    "}}\n"
                    "```\n"
                    "Replace `<THE_ENTIRE_JSON_STRING_FROM_THE_TOOL_OUTPUT_ESCAPED>` with the *complete JSON string* you received from the `make_verification_decision` tool. Ensure this string is properly escaped if it contains quotes (e.g., `{{\\\"decision\\\": \\\"ACCEPT\\\", \\\"score\\\": 95.0}}`).\n"
                    "**CRITICAL: Your entire AIMessage `content` must be *only* this JSON string. Do not add any other text, commentary, or `tool_calls` to your AIMessage.**"
                ),
                "llm_choice": "google",
                "allowed_tools": ["make_verification_decision"]
            }
        ],

        "nodes": [
            {"id": "file_processing_step", "agent_config_name": "FileProcessorAgent"},
            {"id": "ai_scoring_step", "agent_config_name": "AIVerificationScorerAgent"},
            {"id": "decision_step", "agent_config_name": "DecisionMakerAgent"}
        ],
        "start_node_id": "file_processing_step",
        "conditional_edge_maps": {
            "file_processing_step": {
                "HAS_TOOL_CALLS": "tool_executor",
                "IMAGE_READY_FOR_SCORING": "ai_scoring_step",
                "TEXT_READY_FOR_SCORING": "ai_scoring_step",
                "VERIFICATION_HALTED": END,
                "NO_TOOL_CALLS": "ai_scoring_step" # Fallback: if agent doesn't call tool AND doesn't set explicit signal (should be rare with new prompts)
            },
            "ai_scoring_step": {
                "HAS_TOOL_CALLS": "tool_executor",
                "SCORE_OBTAINED": "decision_step",
                "VERIFICATION_HALTED": END,
                "NO_TOOL_CALLS": "decision_step" # Fallback
            },
            "decision_step": {
                "HAS_TOOL_CALLS": "tool_executor",
                "DECISION_MADE": END,
                "NO_TOOL_CALLS": END # Fallback
            }
        }
    }

    # Initialize the workflow manager 
    workflow_manager = AIVerificationWorkflowManager(
        workflow_dict=data_verification_workflow_v2,
        app_config=CONFIG,
        persistence_db=":memory:" 
    )

    # 1. Fetch campaign details from DB
    stmt = select(Campaign).where(Campaign.onchain_campaign_id == onchain_campaign_id)
    result = db.execute(stmt)
    db_campaign = result.scalars().first()

    if not db_campaign:
        raise HTTPException(status_code=404, detail=f"Campaign with onchain_id '{onchain_campaign_id}' not found.")
    
    if not db_campaign.is_active:
        raise HTTPException(status_code=400, detail=f"Campaign '{onchain_campaign_id}' is not active.")

    # 2. Save uploaded file to a temporary path AND perform text extraction if applicable
    temp_dir = tempfile.mkdtemp()
    # Save the original uploaded file first
    original_temp_file_path = os.path.join(temp_dir, submission_file.filename or f"submission_{uuid.uuid4().hex}")
    
    path_for_workflow = original_temp_file_path # Default to original path
    
    try:
        with open(original_temp_file_path, "wb") as buffer:
            shutil.copyfileobj(submission_file.file, buffer)
        logger.info(f"Original submission file saved temporarily to: {original_temp_file_path}")

        path_for_workflow = extract_text_to_temp_file(
            original_file_path=original_temp_file_path,
            original_filename=submission_file.filename or "", # Pass original filename for extension check
            temp_dir_path=temp_dir
        )
        if path_for_workflow != original_temp_file_path:
            logger.info(f"Text extracted. Using processed file for workflow: {path_for_workflow}")
        else:
            logger.info(f"No text extraction performed or extraction failed. Using original file for workflow: {path_for_workflow}")

        # 3. Construct initial_input_payload for the workflow
        task_description = (
            f"Verify submitted data for campaign '{db_campaign.title}' "
            f"(Onchain ID: {db_campaign.onchain_campaign_id}). "
            f"Campaign Type: {db_campaign.campaign_type}. "
            f"Contributor: {wallet_address}."
        )
        
        initial_input_payload = {
            "submitted_data_path": path_for_workflow, 
            "wallet_address": wallet_address,
            "campaign_details": {
                "campaign_description": db_campaign.description,
                "campaign_data_requirements": db_campaign.data_requirements,
                "onchain_campaign_id": db_campaign.onchain_campaign_id,
                "required_quality_score": db_campaign.quality_criteria # Numeric field from DB
            },
            "task_description": task_description
        }
        logger.debug(f"Workflow initial payload: {json.dumps(initial_input_payload, default=str)}")

        # 4. Run the workflow
        thread_id = f"verification_{db_campaign.onchain_campaign_id}_{wallet_address}_{uuid.uuid4()}"
        final_state_dict = await workflow_manager.arun_workflow(initial_input_payload, thread_id=thread_id)

        # 5. Parse results from the workflow's final state
        scratchpad = final_state_dict.get("workflow_scratchpad", {})
        final_decision_json_str = scratchpad.get("final_verification_decision_json")
        
        parsed_decision = {}
        if final_decision_json_str:
            try:
                parsed_decision = json.loads(final_decision_json_str)
            except json.JSONDecodeError:
                logger.error(f"Failed to parse final_verification_decision_json: {final_decision_json_str}")
                parsed_decision = {"decision": "ERROR", "reasoning": "Failed to parse workflow decision output."}
        
        decision = parsed_decision.get("decision", "UNKNOWN")
        # The score might be directly in scratchpad or inside the decision JSON
        score = parsed_decision.get("score", scratchpad.get("verification_score")) 
        reasoning = parsed_decision.get("reasoning", "No reasoning provided by workflow.")
        
        file_type_processed = None
        if scratchpad.get("image_file_to_verify"):
            file_type_processed = "image"
        elif scratchpad.get("text_content_to_verify"):
            file_type_processed = "text"
        
    

        # 7. Return API Response
        return VerificationApiResponse(
            message="Submission processed.",
            onchain_campaign_id=onchain_campaign_id,
            contributor_wallet_address=wallet_address,
            decision=decision,
            score=float(score) if score is not None else None,
            reasoning=reasoning,
            file_type_processed=file_type_processed
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during submission verification for campaign {onchain_campaign_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error during verification: {str(e)}")
    finally:
        # 8. Clean up the temporary directory and its contents
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
            logger.info(f"Cleaned up temporary directory: {temp_dir}")
        if submission_file:
            await submission_file.close()