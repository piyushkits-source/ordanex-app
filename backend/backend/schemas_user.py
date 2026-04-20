from pydantic import BaseModel
from uuid import UUID

class UserCreate(BaseModel):
    email: str
    password: str
    role: str = "USER"
    client_id: str

class UserRead(BaseModel):
    user_id: UUID
    email: str
    role: str
    client_id: str

    class Config:
        from_attributes = True
