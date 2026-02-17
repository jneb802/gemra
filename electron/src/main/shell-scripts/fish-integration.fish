# Gemra Terminal - fish Shell Integration

# Check if we're in Gemra terminal
if not set -q GEMRA_TERMINAL
    exit
end

function __gemra_prompt_start --on-event fish_prompt
    printf '\e]133;A\e\\'
end

function __gemra_prompt_end --on-event fish_preexec
    printf '\e]133;B\e\\'
    printf '\e]133;C\e\\'
end

function __gemra_command_end --on-event fish_postexec
    printf '\e]133;D;%s\e\\' $status
end

function __gemra_update_cwd --on-variable PWD
    printf '\e]7;file://%s%s\e\\' (hostname) $PWD
end

# Initial prompt start
printf '\e]133;A\e\\'

echo "[Gemra] Shell integration loaded (fish)"
