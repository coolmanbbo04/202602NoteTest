from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class NoteCreate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    content: str = Field(min_length=1, max_length=50_000)


class NoteUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    content: str | None = Field(default=None, min_length=1, max_length=50_000)


class NoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str | None
    content: str
    share_id: str | None
    created_at: datetime
    updated_at: datetime


class ShareOut(BaseModel):
    share_id: str
