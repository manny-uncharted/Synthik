import json
import os
import tempfile
import uuid
import shutil

import pytest
from fastapi import status

from app.generation.synthetic_generation_tools import ToolRegistry

# If you have a custom exception for “not found”
from app.core.exceptions import NotFoundError


def test_upload_dataset_and_read(client):
    # 1) Create a small CSV on-disk
    tmpdir = tempfile.mkdtemp()
    try:
        csv_path = os.path.join(tmpdir, "data.csv")
        with open(csv_path, "w", encoding="utf-8") as f:
            f.write("col1,col2\nfoo,bar\nbaz,qux\n")

        # 2) POST /datasets with upload_file
        with open(csv_path, "rb") as upload:
            resp = client.post(
                "/datasets",
                data={
                    "name": "My CSV",
                    "description": "desc",
                    "category": "test",
                    "tags": "a,b,c",
                    "visibility": "public",
                    "license": "MIT",
                    "price": 0.0,
                    "price_per_row": 0.0,
                    "data_type": "csv",
                    "dataset_type": "upload",
                },
                files={"upload_file": ("data.csv", upload, "text/csv")},
            )
        assert resp.status_code == status.HTTP_201_CREATED
        payload = resp.json()
        ds = payload["dataset"]
        assert ds["name"] == "My CSV"
        assert payload["preview"][0]["col1"] == "foo"

        # 3) GET /datasets/{id}
        ds_id = ds["id"]
        get_resp = client.get(f"/datasets/{ds_id}")
        assert get_resp.status_code == 200
        fetched = get_resp.json()
        assert fetched["id"] == ds_id
        assert fetched["name"] == "My CSV"

    finally:
        shutil.rmtree(tmpdir)


def test_custom_synthetic_csv(monkeypatch, client):
    # Stub out the CSV tool so we never actually call LLMs or write files
    class DummyTool:
        name = "generate_synthetic_csv"
        def invoke(self, args):
            # pretend it wrote to /tmp/foo.csv and returned a JSON pointer
            return json.dumps({"output_path": "/tmp/foo.csv"})
    registry = ToolRegistry()
    monkeypatch.setattr(registry, "get_tool", lambda name: DummyTool())

    # Monkey-patch the registry in your endpoint module
    import app.dataset.routes as R
    monkeypatch.setattr(R, "ToolRegistry", lambda: registry)

    config = {
        "columns": [{"name":"a","type":"categorical","categories":["x","y"]}],
        "rows": 2,
        "output_path": "/tmp/foo.csv",
        "image_delay_seconds":1.0
    }
    resp = client.post(
        "/datasets",
        data={
            "name":"SYN",
            "description":"d",
            "category":"c",
            "tags":"",
            "visibility":"public",
            "license":"MIT",
            "price":0.0,
            "price_per_row":0.0,
            "data_type":"csv",
            "dataset_type":"custom",
            "config": json.dumps(config)
        }
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["dataset"]["name"] == "SYN"
    assert body["preview"] == []  # since /tmp/foo.csv doesn’t exist, preview is empty


def test_list_datasets_empty(client):
    resp = client.get("/datasets")
    assert resp.status_code == 200
    assert resp.json()["datasets"] == []
