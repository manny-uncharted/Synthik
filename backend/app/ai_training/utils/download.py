import requests
from pathlib import Path
from typing import Union

def download_file(
    url: str,
    file_type: str,
    dest_path: Union[str, Path],
    chunk_size: int = 8_192,
) -> Path:
    dest = Path(dest_path)

    if dest.is_dir() or str(dest).endswith(("/", "\\")):
        # use single-quotes inside the f-string
        filename = f"{url.rstrip('/').split('/')[-1]}.{file_type}"
        dest = dest / filename

    dest.parent.mkdir(parents=True, exist_ok=True)

    with requests.get(url, stream=True, timeout=10) as resp:
        resp.raise_for_status()
        with dest.open("wb") as fp:
            for chunk in resp.iter_content(chunk_size=chunk_size):
                if chunk:
                    fp.write(chunk)

    return dest

if __name__ == "__main__":
    URL = "https://0x2d782ecc050ce61c891d0bd1fdea8b5085ad08b5.calibration.filcdn.io/baga6ea4seaqijrtundo3swc76yc5fvg7urchna572efqhfrxasmbko5qyw5xugq"
    try:
        out_path = download_file(URL, "csv", "/Users/naija/Documents/gigs/synthik/backend/app/")
        print(f"✅ Download complete: {out_path}")
    except Exception as e:
        print(f"❌ Failed to download {URL}: {e}")
