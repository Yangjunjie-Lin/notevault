from fastapi.testclient import TestClient

from app import dependencies
from app.main import app


def test_missing_token_returns_401():
    app.dependency_overrides.clear()
    with TestClient(app) as client:
        response = client.get("/notes")
    assert response.status_code == 401
    assert response.json()["detail"] == "Missing bearer token"


def test_invalid_token_returns_401(monkeypatch):
    app.dependency_overrides.clear()
    monkeypatch.setattr(
        dependencies,
        "verify_firebase_token",
        lambda _token: (_ for _ in ()).throw(ValueError("bad token")),
    )
    with TestClient(app) as client:
        response = client.get("/notes", headers={"Authorization": "Bearer invalid"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid Firebase token"


def test_firebase_admin_misconfiguration_returns_503(monkeypatch):
    app.dependency_overrides.clear()
    monkeypatch.setattr(
        dependencies,
        "verify_firebase_token",
        lambda _token: (_ for _ in ()).throw(RuntimeError("Firebase credentials were not found")),
    )
    with TestClient(app) as client:
        response = client.get("/notes", headers={"Authorization": "Bearer token"})
    assert response.status_code == 503
    assert "not configured" in response.json()["detail"]


def test_token_without_uid_returns_401(monkeypatch):
    app.dependency_overrides.clear()
    monkeypatch.setattr(dependencies, "verify_firebase_token", lambda _token: {})
    with TestClient(app) as client:
        response = client.get("/notes", headers={"Authorization": "Bearer token"})
    assert response.status_code == 401
    assert "uid" in response.json()["detail"]
