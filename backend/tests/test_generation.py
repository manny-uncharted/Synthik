import pytest
from fastapi import status

# 1) Preview
@pytest.mark.parametrize("rows,quality", [(1,"fast"), (5,"high")])
def test_preview_dataset(client, rows, quality):
    payload = {
        "config": {
            "schema": [
                {"id":"f1","name":"f1","type":"string","description":"d","constraints":{}}
            ],
            "rows": rows,
            "model": "test",
            "quality": quality
        }
    }
    resp = client.post("/generation/preview", json=payload)
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert len(data["preview"]) == rows
    assert "generationTime" in data and "estimatedCost" in data

def test_get_templates(client):
    resp = client.get("/generation/templates")
    assert resp.status_code == 200
    tpl = resp.json()["templates"]
    assert isinstance(tpl, list)
    assert all("id" in t and "schema" in t for t in tpl)

# 3) Generation-job status
def test_generation_job_not_found(client):
    resp = client.get("/generation/does-not-exist")
    assert resp.status_code == status.HTTP_404_NOT_FOUND
