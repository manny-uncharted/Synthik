#!/bin/bash

# Script to start Walrus services (aggregator, publisher, daemon) in separate tmux sessions

# --- Configuration ---
AGGREGATOR_PORT="8080"
PUBLISHER_PORT="8081"
DAEMON_PORT="8082"
PUBLISHER_WALLETS_DIR="$HOME/.config/walrus/publisher-wallets"
DAEMON_WALLETS_DIR="$HOME/.config/walrus/daemon-wallets"
N_CLIENTS="1"
LOG_DIR="$HOME/walrus_logs"
METRICS_PORT_PUBLISHER="8083" # Add metrics ports
METRICS_PORT_DAEMON="8084"
# --- End Configuration ---

# --- Helper Functions ---
start_service() {
  local service_name="$1"
  local command="$2"
  local session_name="${service_name}_walrus"
  local log_file="$LOG_DIR/${service_name}.log"
  if ! command -v tmux &> /dev/null; then
    echo "tmux is not installed. Please install it: sudo apt-get install tmux -y"
    return 1
  fi
  if [ ! -S "$HOME/.tmux/default" ]; then
      tmux start-server
  fi
  if ! tmux ls | grep -q "$session_name"; then
    echo "Starting $service_name in tmux session: $session_name and logging to $log_file"
    tmux new-session -d -s "$session_name" "$command >> \"$log_file\" 2>&1"
     if [ $? -ne 0 ]; then
      echo "ERROR: Failed to start $service_name. Check log file: $log_file"
      return 1
    fi
  else
    echo "Tmux session $session_name already exists. Attaching to it."
    tmux attach-session -t "$session_name"
  fi
}
# --- Main Script ---
mkdir -p "$PUBLISHER_WALLETS_DIR"
mkdir -p "$DAEMON_WALLETS_DIR"
mkdir -p "$LOG_DIR"
# Start the services in separate tmux sessions
start_service "aggregator" "walrus aggregator --bind-address '0.0.0.0:$AGGREGATOR_PORT'"
start_service "publisher" "walrus publisher --bind-address '0.0.0.0:$PUBLISHER_PORT' --sub-wallets-dir '$PUBLISHER_WALLETS_DIR' --n-clients $N_CLIENTS --metrics-address '0.0.0.0:$METRICS_PORT_PUBLISHER'"
start_service "daemon" "walrus daemon --bind-address '0.0.0.0:$DAEMON_PORT' --sub-wallets-dir '$DAEMON_WALLETS_DIR' --n-clients $N_CLIENTS --metrics-address '0.0.0.0:$METRICS_PORT_DAEMON'"

echo "
Walrus services (aggregator, publisher, and daemon) have been started in separate tmux sessions.  Logs are being written to $LOG_DIR.

**IMPORTANT SECURITY NOTES:**

1.  **EC2 Security Groups:**
    * You MUST configure your EC2 security group to allow inbound traffic on the following ports:
        * $AGGREGATOR_PORT (for aggregator)
        * $PUBLISHER_PORT (for publisher)
        * $DAEMON_PORT (for daemon)
        * $METRICS_PORT_PUBLISHER
        * $METRICS_PORT_DAEMON
    * For each port, create an inbound rule:
        * Type: Custom TCP
        * Port Range: (e.g., 8080)
        * Source:  **STRONGLY RECOMMEND RESTRICTING THIS** to known IP addresses or ranges.  Do NOT leave it open to '0.0.0.0/0' (Anywhere) in a production environment unless you have other strong security measures in place.

2.  **Sui Wallet Security:**
    * The publisher and daemon processes will use the Sui wallet configured on this server to perform on-chain operations.  Ensure the security of this wallet.  Do NOT expose your private keys directly.
    * This script assumes that your Sui wallet is already set up and configured for use by Walrus.

3.  **Firewall (Optional):**
    * If you are using a firewall on your Ubuntu instance (e.g., ufw), ensure that the ports are also open in that firewall.

You can use the following commands to manage the tmux sessions:

* Attach to the aggregator session: \`tmux a -t aggregator_walrus\`
* Attach to the publisher session: \`tmux a -t publisher_walrus\`
* Attach to the daemon session: \`tmux a -t daemon_walrus\`
* List all running tmux sessions: \`tmux ls\`
* Kill a specific tmux session (e.g., to kill the aggregator session): \`tmux kill-session -t aggregator_walrus\`

"
