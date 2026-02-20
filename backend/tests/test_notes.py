import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from backend.app.main import app
from backend.app.db import Base, get_db


@pytest.fixture()
def client(tmp_path):
    # 每次测试函数都用一个独立的 sqlite 文件，避免文件被别的测试/进程占用
    db_file = tmp_path / "test_notepad.db"
    db_url = f"sqlite:///{db_file}"

    engine = create_engine(
        db_url,
        connect_args={"check_same_thread": False},
        poolclass=NullPool,  # 关键：不用连接池，连接用完就关，Windows 上更不容易锁文件
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as c:
        yield c

    # 清理：释放引擎
    engine.dispose()
    app.dependency_overrides.clear()


def test_create_note_201(client):
    r = client.post("/api/notes", json={"title": "t1", "content": "hello"})
    assert r.status_code == 201
    data = r.json()
    assert data["id"] > 0
    assert data["title"] == "t1"
    assert data["content"] == "hello"
    assert data["share_id"] is None


def test_create_note_validation_422_empty_content(client):
    r = client.post("/api/notes", json={"title": "x", "content": ""})
    assert r.status_code == 422


def test_list_notes_returns_array(client):
    r = client.get("/api/notes")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_note_200(client):
    created = client.post("/api/notes", json={"title": None, "content": "abc"}).json()
    r = client.get(f"/api/notes/{created['id']}")
    assert r.status_code == 200
    assert r.json()["content"] == "abc"


def test_get_note_404(client):
    r = client.get("/api/notes/999999")
    assert r.status_code == 404


def test_patch_note_updates_title_only(client):
    created = client.post("/api/notes", json={"title": "old", "content": "ccc"}).json()
    r = client.patch(f"/api/notes/{created['id']}", json={"title": "new"})
    assert r.status_code == 200
    data = r.json()
    assert data["title"] == "new"
    assert data["content"] == "ccc"


def test_patch_note_updates_content_only(client):
    created = client.post("/api/notes", json={"title": "tt", "content": "old"}).json()
    r = client.patch(f"/api/notes/{created['id']}", json={"content": "new content"})
    assert r.status_code == 200
    assert r.json()["content"] == "new content"


def test_patch_note_404(client):
    r = client.patch("/api/notes/999999", json={"title": "x"})
    assert r.status_code == 404


def test_delete_note_204_then_404(client):
    created = client.post("/api/notes", json={"title": "d", "content": "bye"}).json()
    r = client.delete(f"/api/notes/{created['id']}")
    assert r.status_code == 204

    r2 = client.get(f"/api/notes/{created['id']}")
    assert r2.status_code == 404


def test_share_note_generates_uuid_and_can_fetch(client):
    created = client.post("/api/notes", json={"title": "s", "content": "share me"}).json()
    r = client.post(f"/api/notes/{created['id']}/share")
    assert r.status_code == 200
    share_id = r.json()["share_id"]
    assert isinstance(share_id, str)
    assert len(share_id) == 36

    r2 = client.get(f"/api/share/{share_id}")
    assert r2.status_code == 200
    assert r2.json()["content"] == "share me"


def test_share_refresh_changes_share_id(client):
    created = client.post("/api/notes", json={"title": "s2", "content": "x"}).json()
    s1 = client.post(f"/api/notes/{created['id']}/share").json()["share_id"]
    s2 = client.post(f"/api/notes/{created['id']}/share").json()["share_id"]
    assert s1 != s2


def test_get_shared_note_404(client):
    r = client.get("/api/share/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404
