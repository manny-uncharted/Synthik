# #!/bin/bash
# # Pull Request Process Script

# # Ask whether to switch branch or use current branch.
# read -p "Do you want to switch to a different branch? (y/n): " switch_choice

# if [[ "$switch_choice" =~ ^[Yy]$ ]]; then
#     read -p "Enter the branch name to switch to: " branch_name
#     echo "Switching to branch: $branch_name"
#     git checkout "$branch_name"
# else
#     branch_name=$(git rev-parse --abbrev-ref HEAD)
#     echo "Using current branch: $branch_name"
# fi

# # Define commands in the order to run them.
# commands=(
#   "git pull origin main"
#   "git add ."
#   "pre-commit run --all-files"
#   "poetry run cz commit"
#   "git push origin ${branch_name}"
# )

# # Global flag to indicate whether to run all remaining commands.
# RUN_ALL=false

# # Function to prompt and run a command.
# run_command() {
#   local cmd="$1"
#   if [ "$RUN_ALL" = true ]; then
#     echo "Running: $cmd"
#     eval "$cmd"
#   else
#     echo "Next command: $cmd"
#     read -p "Choose an option - (y)es to run, (n)o to skip, (a)ll to run all remaining commands, (q)uit: " choice
#     case "$choice" in
#       a|A)
#         RUN_ALL=true
#         echo "Running: $cmd"
#         eval "$cmd"
#         ;;
#       q|Q)
#         echo "Exiting..."
#         exit 0
#         ;;
#       y|Y)
#         echo "Running: $cmd"
#         eval "$cmd"
#         ;;
#       n|N)
#         echo "Skipping command: $cmd"
#         ;;
#       *)
#         echo "Invalid option. Skipping command: $cmd"
#         ;;
#     esac
#   fi
# }

# # Iterate over the commands.
# for cmd in "${commands[@]}"; do
#   run_command "$cmd"
#   # If not running all commands at once, wait for confirmation to continue.
#   if [ "$RUN_ALL" = false ]; then
#     read -p "Press Enter to continue to the next command..."
#   fi
# done

# echo "All commands processed."


#!/bin/bash
# Pull Request Process Script

# Ask whether to switch branch or use current branch.
read -p "Do you want to switch to a different branch? (y/n): " switch_choice

if [[ "$switch_choice" =~ ^[Yy]$ ]]; then
    read -p "Enter the branch name to switch to: " branch_name
    echo "Switching to branch: $branch_name"
    git checkout "$branch_name"
else
    branch_name=$(git rev-parse --abbrev-ref HEAD)
    echo "Using current branch: $branch_name"
fi

# Define commands in the order to run them.
commands=(
  "git pull origin main"
  "git add ."
  "pre-commit run --all-files"
  "poetry run cz commit"
  "git push origin ${branch_name}"
)

# Global flag to indicate whether to run all remaining commands.
RUN_ALL=false

# Function to prompt and run a command.
run_command() {
  local cmd="$1"
  if [ "$RUN_ALL" = true ]; then
    echo "Running: $cmd"
    eval "$cmd"
    local status=$?
    # If pre-commit run returns non-zero, assume reformatting occurred.
    if [[ "$cmd" == "pre-commit run --all-files" && $status -ne 0 ]]; then
      echo "Reformatting detected. Rerunning 'git add .' to stage modified files..."
      git add .
    fi
  else
    echo "Next command: $cmd"
    read -p "Choose an option - (y)es to run, (n)o to skip, (a)ll to run all remaining commands, (q)uit: " choice
    case "$choice" in
      a|A)
        RUN_ALL=true
        echo "Running: $cmd"
        eval "$cmd"
        local status=$?
        if [[ "$cmd" == "pre-commit run --all-files" && $status -ne 0 ]]; then
          echo "Reformatting detected. Rerunning 'git add .' to stage modified files..."
          git add .
        fi
        ;;
      q|Q)
        echo "Exiting..."
        exit 0
        ;;
      y|Y)
        echo "Running: $cmd"
        eval "$cmd"
        local status=$?
        if [[ "$cmd" == "pre-commit run --all-files" && $status -ne 0 ]]; then
          echo "Reformatting detected. Rerunning 'git add .' to stage modified files..."
          git add .
        fi
        ;;
      n|N)
        echo "Skipping command: $cmd"
        ;;
      *)
        echo "Invalid option. Skipping command: $cmd"
        ;;
    esac
  fi
}

# Iterate over the commands.
for cmd in "${commands[@]}"; do
  run_command "$cmd"
  # If not running all commands at once, wait for confirmation to continue.
  if [ "$RUN_ALL" = false ]; then
    read -p "Press Enter to continue to the next command..."
  fi
done

echo "All commands processed."
