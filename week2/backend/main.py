from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import shutil
import os
import glob
from pydantic import BaseModel
from typing import List, Dict
import difflib

# Import our modules
from database import DatabaseManager

app = FastAPI(title="NSU PlagiChecker Auth")

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Components
db = DatabaseManager()

# ==================== AUTH MODELS ====================

class LoginRequest(BaseModel):
    email: str
    password: str
    role: str

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    nsu_id: str = None

class AddTeacherRequest(BaseModel):
    name: str
    email: str
    password: str

# ==================== AUTH ENDPOINTS ====================

@app.post("/auth/login")
def login(req: LoginRequest):
    user = db.authenticate_user(req.email, req.password, req.role)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password for this role.")
    return {"success": True, "user": user}

@app.post("/auth/register")
def register(req: RegisterRequest):
    if db.email_exists(req.email):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user = db.add_user(
        name=req.name,
        email=req.email,
        password=req.password,
        role="student",
        nsu_id=req.nsu_id
    )
    if not user:
        raise HTTPException(status_code=409, detail="Registration failed.")
    return {"success": True, "user": user}

@app.get("/auth/users")
def get_users():
    users = db.get_all_users(exclude_admins=True)
    return {"users": users}

@app.post("/auth/users/teacher")
def add_teacher(req: AddTeacherRequest):
    if db.email_exists(req.email):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user = db.add_user(
        name=req.name,
        email=req.email,
        password=req.password,
        role="teacher"
    )
    if not user:
        raise HTTPException(status_code=500, detail="Failed to add teacher.")
    return {"success": True, "user": user}

@app.delete("/auth/users/{user_id}")
def delete_user(user_id: int):
    success = db.delete_user(user_id)
    if not success:
        raise HTTPException(status_code=404, detail="User not found or cannot be deleted.")
    return {"success": True}

@app.get("/")
def health_check():
    return {"status": "active", "mode": "Auth-Only-Backend"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
