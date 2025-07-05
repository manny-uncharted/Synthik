# mlops_sdk/trainers/local.py

import subprocess
import threading
import os
import uuid
from typing import Tuple, Dict, Any


from app.ai_training.trainers.base import BaseTrainer, TrainerError
from app.core.enums.ai_training import JobStatus


class LocalScriptTrainer(BaseTrainer):
    """
    Trainer that runs a user-provided Python script locally (or in a container),
    captures stdout/stderr, and streams progress back to the platform.
    """

    def submit(self) -> Tuple[str, JobStatus]:
        """
        Launches the training script as a subprocess.
        Expects in `script_config`:
          - entry_point: path to training .py
          - args: list of additional CLI args
          - work_dir: optional working directory
        """
        entry = self.script_config["entry_point"]
        args = self.script_config.get("args", [])
        work_dir = self.script_config.get("work_dir", os.getcwd())

        # Unique run ID for logs
        run_id = f"{self.platform_job_id}-{uuid.uuid4().hex[:6]}"
        log_dir = os.path.join(work_dir, "mlops_logs", run_id)
        os.makedirs(log_dir, exist_ok=True)

        cmd = [self.python_executable, entry, *args]
        env = os.environ.copy()
        env.update(self.script_config.get("env", {}))

        # Launch subprocess
        try:
            proc = subprocess.Popen(
                cmd,
                cwd=work_dir,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
        except Exception as e:
            raise TrainerError(f"Failed to start local training process: {e}")

        # Stream logs in background
        def _stream(pipe, key):
            with open(os.path.join(log_dir, f"{key}.log"), "w") as f:
                for line in iter(pipe.readline, ""):
                    f.write(line)
                    f.flush()
                    # send each line back to platform via callback
                    self._on_log(line, stream=key)
                pipe.close()

        threading.Thread(target=_stream, args=(proc.stdout, "stdout"), daemon=True).start()
        threading.Thread(target=_stream, args=(proc.stderr, "stderr"), daemon=True).start()

        self._store_run_metadata({"run_id": run_id, "log_dir": log_dir})
        return run_id, JobStatus.SUBMITTED

    def status(self, external_job_id: str) -> JobStatus:
        """
        Checks on the running process. We store PID in metadata to retrieve it here.
        """
        meta = self._load_run_metadata()
        pid = meta.get("pid")
        if not pid:
            return JobStatus.UNKNOWN

        try:
            os.kill(pid, 0)
        except OSError:
            # process has exited
            exit_code = meta.get("exit_code", 1)
            return JobStatus.COMPLETED if exit_code == 0 else JobStatus.FAILED
        else:
            return JobStatus.RUNNING

    def _on_log(self, line: str, stream: str):
        """
        Callback whenever a new log line is available.
        Sends an event or REST callback into the platform for real-time tracking.
        """
        # e.g. post to our /logs endpoint
        payload = {"job_id": self.platform_job_id, "stream": stream, "message": line}
        try:
            self.client.post("/training/logs", json=payload)
        except Exception:
            pass  # best-effort

    def _store_run_metadata(self, data: Dict[str, Any]):
        """
        Persist metadata (pid, exit_code, log_dir) to local .mlops/<job>.json
        """
        import json
        path = os.path.expanduser(f"~/.mlops/{self.platform_job_id}.json")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            json.dump(data, f)

    def _load_run_metadata(self) -> Dict[str, Any]:
        import json
        path = os.path.expanduser(f"~/.mlops/{self.platform_job_id}.json")
        try:
            with open(path) as f:
                return json.load(f)
        except Exception:
            return {}
