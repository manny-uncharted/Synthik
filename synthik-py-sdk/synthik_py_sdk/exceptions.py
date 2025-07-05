# mlops_sdk/exceptions.py

import httpx

class MlopsError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(f"{status_code} → {detail}")
        self.status_code = status_code
        self.detail = detail

    @classmethod
    def from_response(cls, resp: httpx.Response):
        try:
            data = resp.json()
            detail = data.get("detail") or data
        except Exception:
            detail = resp.text
        return cls(resp.status_code, str(detail))

