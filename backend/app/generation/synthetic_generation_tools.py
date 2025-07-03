# synthetic_generation_tools.py

import os
import json
import asyncio
import time
from typing import List, Dict, Any, Optional, Type
from pydantic import BaseModel, Field, conint, constr
from langchain_core.tools import BaseTool
from langchain_core.messages import ToolMessage
from uuid import uuid4

from app.core.logger import logger
from app.generation.csv_llm import SyntheticCSVGenerationTool
from app.generation.image_llm import SyntheticImageGenerationTool
from app.generation.text_llm import SyntheticTextGenerationTool



from langchain_core.tools import BaseTool
from typing import Dict

class ToolRegistry:
    def __init__(self):
        self.tools: Dict[str, BaseTool] = {}
        self._register()

    def _register(self):
        for tool in [
            SyntheticTextGenerationTool(),
            SyntheticImageGenerationTool(),
            SyntheticCSVGenerationTool(),
            # … plus your other existing tools …
        ]:
            self.tools[tool.name] = tool
            logger.info(f"Registered synthetic tool: {tool.name}")

    def get_tool(self, name: str) -> Optional[BaseTool]:
        return self.tools.get(name)

    def get_tools(self) -> List[BaseTool]:
        return list(self.tools.values())

# Usage:
# registry = ToolRegistry()
# text_out = registry.get_tool("generate_synthetic_text").invoke({...})
# image_out = registry.get_tool("generate_synthetic_images").invoke({...})
# csv_out   = registry.get_tool("generate_synthetic_csv").invoke({...})
