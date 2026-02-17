#!/bin/bash
# Gemra Terminal - bash Shell Integration

# Check if we're in Gemra terminal
if [[ -z "$GEMRA_TERMINAL" ]]; then
  return
fi

# Mark command end and prompt start
__gemra_precmd() {
  local exit_code=$?

  # OSC 133 D - Command finished (with exit code)
  printf "\e]133;D;%s\e\\" "$exit_code"

  # OSC 133 A - Prompt start
  printf "\e]133;A\e\\"

  # OSC 7 - Update working directory
  printf "\e]7;file://%s%s\e\\" "$HOSTNAME" "$PWD"
}

# Mark prompt end and command start
__gemra_preexec() {
  # OSC 133 B - Prompt end
  printf "\e]133;B\e\\"

  # OSC 133 C - Command execution start
  printf "\e]133;C\e\\"
}

# Add to PROMPT_COMMAND
if [[ "$PROMPT_COMMAND" != *"__gemra_precmd"* ]]; then
  PROMPT_COMMAND="__gemra_precmd${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
fi

# Trap DEBUG for preexec
if [[ "$BASH_VERSION" ]]; then
  trap '__gemra_preexec' DEBUG
fi

# Initial prompt start
printf "\e]133;A\e\\"

echo "[Gemra] Shell integration loaded (bash)"
