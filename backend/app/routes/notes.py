from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select

from ..db import get_db
from ..models import Note
from ..schemas import NoteCreate, NoteUpdate, NoteOut, ShareOut

router = APIRouter()


def _get_note_or_404(db: Session, note_id: int) -> Note:
    note = db.get(Note, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


@router.get("/api/notes", response_model=list[NoteOut])
def list_notes(db: Session = Depends(get_db)):
    notes = db.execute(select(Note).order_by(Note.id.desc())).scalars().all()
    return notes


@router.post("/api/notes", response_model=NoteOut, status_code=status.HTTP_201_CREATED)
def create_note(payload: NoteCreate, db: Session = Depends(get_db)):
    note = Note(title=payload.title, content=payload.content)
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.get("/api/notes/{note_id}", response_model=NoteOut)
def get_note(note_id: int, db: Session = Depends(get_db)):
    return _get_note_or_404(db, note_id)


@router.patch("/api/notes/{note_id}", response_model=NoteOut)
def update_note(note_id: int, payload: NoteUpdate, db: Session = Depends(get_db)):
    note = _get_note_or_404(db, note_id)

    if payload.title is not None:
        note.title = payload.title
    if payload.content is not None:
        note.content = payload.content

    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.delete("/api/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(note_id: int, db: Session = Depends(get_db)):
    note = _get_note_or_404(db, note_id)
    db.delete(note)
    db.commit()
    return None


@router.post("/api/notes/{note_id}/share", response_model=ShareOut)
def share_note(note_id: int, db: Session = Depends(get_db)):
    note = _get_note_or_404(db, note_id)
    note.share_id = str(uuid4())
    db.add(note)
    db.commit()
    db.refresh(note)
    return {"share_id": note.share_id}


@router.get("/api/share/{share_id}", response_model=NoteOut)
def get_shared_note(share_id: str, db: Session = Depends(get_db)):
    note = db.execute(select(Note).where(Note.share_id == share_id)).scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Shared note not found")
    return note
