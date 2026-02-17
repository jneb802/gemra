#!/bin/zsh
# Gemra Terminal - zsh Shell Integration
# This script adds OSC 133 sequences for block-based terminal support

# Check if we're in Gemra terminal
if [[ -z "$GEMRA_TERMINAL" ]]; then
  return
fi

# Mark prompt start
gemra_precmd() {
  local exit_code=$?

  # OSC 133 D - Command finished (with exit code)
  print -n "\e]133;D;${exit_code}\e\\"

  # OSC 133 A - Prompt start
  print -n "\e]133;A\e\\"

  # OSC 7 - Update working directory
  print -n "\e]7;file://${HOST}${PWD}\e\\"
}

# Mark command start
gemra_preexec() {
  # OSC 133 B - Prompt end
  print -n "\e]133;B\e\\"

  # OSC 133 C - Command execution start
  print -n "\e]133;C\e\\"
}

# Add to precmd/preexec hooks
precmd_functions+=(gemra_precmd)
preexec_functions+=(gemra_preexec)

# Initial prompt start (for first prompt)
print -n "\e]133;A\e\\"

echo "[Gemra] Shell integration loaded (zsh)"
