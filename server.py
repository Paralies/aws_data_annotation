from fastapi import HTTPException, Request
import os
import re
import json
import random
import csv
from datetime import datetime
from typing import Literal

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from fastapi import HTTPException, Form
import bcrypt
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

LOG_DIR = "logs"
DATASET_DIR = "DB"
BASE_CONTENTS_URL = "http://localhost:8000/contents"  # adjust if using actual file server or CDN
ANNOTATOR_FILE = os.path.join(LOG_DIR, "annotators.json")

os.makedirs(LOG_DIR, exist_ok=True)

app = FastAPI()

app.mount("/static", StaticFiles(directory="frontend", html=True), name="frontend")
app.mount("/contents", StaticFiles(directory=DATASET_DIR), name="contents")

# Serve index.html at root
@app.get("/")
def root():
    return FileResponse("frontend/index.html")


# IMAGE DB
def load_db(metadata):
    data_db = {}
    for i, item in enumerate(metadata, 1):
        # YouTube 링크인지 확인
        filename = item['filename']
        if filename.startswith('www.youtube.com') or filename.startswith('youtube.com') or filename.startswith('youtu.be'):
            # YouTube 링크에 https:// 추가
            content_url = f"https://{filename}" if not filename.startswith('http') else filename
        elif filename.startswith('http://') or filename.startswith('https://'):
            # 이미 전체 URL인 경우 그대로 사용
            content_url = filename
        else:
            # 로컬 파일인 경우
            content_url = f"{BASE_CONTENTS_URL}/{filename}"
        
        data_db[f"{item['model_id']}_{item['input_type']}_{item['task_type']}_{i}"] = {
            "content_url": content_url,
            "model_id": item['model_id'],
            "question": item["question"],
            "input_type": item["input_type"],
            "task_type": item['task_type'],
            'text_prompt': item.get('text_prompt', None)
        }
    return data_db

# Load metadata and generate image database
with open(os.path.join(DATASET_DIR, "meta.json"), "r", encoding="utf-8") as f:
    metadata = json.load(f)
data_db = load_db(metadata)



# Annotator
class Annotator(BaseModel):
    annotator_id: str
    password: str
    age: int
    gender: Literal["male", "female", "other"]

def load_annotators():
    if os.path.exists(ANNOTATOR_FILE):
        with open(ANNOTATOR_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def save_annotators(data):
    with open(ANNOTATOR_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

class Annotation(BaseModel):
    content_id: str
    answer: str
    annotator_id: str  # Use ID only
    session_id: str
    time_spent: int


annotations = []


# Login endpoint
@app.post("/login")
def login(
    annotator_id: str = Form(...),
    password: str = Form(...)
):
    annotators = load_annotators()
    user = annotators.get(annotator_id)
    if user is None or not bcrypt.checkpw(password.encode('utf-8'), user["password"].encode('utf-8')):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"status": "ok", "annotator_id": annotator_id}

# Register endpoint
@app.post("/register")
def register(
    annotator_id: str = Form(...),
    password: str = Form(...),
    age: int = Form(...),
    gender: str = Form(...)
):
    annotators = load_annotators()
    if annotator_id in annotators:
        raise HTTPException(status_code=400, detail="Annotator ID already exists")

    hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    user_data = {
        "annotator_id": annotator_id,
        "password": hashed_password,
        "age": age,
        "gender": gender,
        "registered_at": datetime.utcnow().isoformat()
    }
    annotators[annotator_id] = user_data
    save_annotators(annotators)
    user_json = os.path.join(LOG_DIR, f"{annotator_id}.json")
    with open(user_json, "w", encoding="utf-8") as f:
        json.dump([], f, ensure_ascii=False, indent=2)
    return {"status": "ok", "message": "Annotator registered", "annotator_id": annotator_id}

# Route to handle password change
from fastapi import Body

class ChangePasswordRequest(BaseModel):
    annotator_id: str
    old_password: str
    new_password: str

@app.post("/change-password")
def change_password(
    annotator_id: str = Form(...),
    old_password: str = Form(...),
    new_password: str = Form(...)
):
    annotators = load_annotators()
    user = annotators.get(annotator_id)
    if user is None:
        return JSONResponse({"success": False, "message": "User not found"}, status_code=404)
    # Check old password
    if not bcrypt.checkpw(old_password.encode('utf-8'), user["password"].encode('utf-8')):
        return JSONResponse({"success": False, "message": "Old password is incorrect"}, status_code=401)
    # Update password
    hashed_password = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    annotators[annotator_id]["password"] = hashed_password
    save_annotators(annotators)
    return {"success": True, "message": "Password updated successfully"}




from fastapi import Query

# Modified /get-task endpoint to accept annotator_id and session_id as query parameters.
@app.get("/get-task")
def get_task(annotator_id: str = Query(...), session_id: str = Query(...)):
    # Load user's JSON annotation file
    user_file = os.path.join(LOG_DIR, f"{annotator_id}.json")
    completed_ids = set()

    if os.path.exists(user_file):
        with open(user_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            completed_ids = {d["content_id"] for d in data if d.get("session_id") == session_id}

    # Find remaining tasks
    remaining_tasks = [tid for tid in data_db.keys() if tid not in completed_ids]
    if not remaining_tasks:
        return {"message": "All tasks completed", "completed": True}

    task_id = random.choice(remaining_tasks)
    task = data_db[task_id]
    task["content_id"] = task_id
    return JSONResponse(content=task)

# Admin endpoint to refresh the image DB from meta.json 
@app.post("/admin/refresh-db")
def refresh_db():
    global data_db
    with open(os.path.join(DATASET_DIR, "meta.json"), "r", encoding="utf-8") as f:
        metadata = json.load(f)

    load_db(metadata)

    return {"status": "ok", "message": "Database refreshed."}


# Serve list of annotator IDs for admin
@app.get("/admin/annotators")
def get_annotators():
    annotators = load_annotators()
    return list(annotators.keys())

# Renamed from get_all_annotations to get_all_annotators, and route changed
@app.get("/admin/all-annotators")
def get_all_annotators():
    all_data = []
    annotators = load_annotators()

    # Load metadata to determine total number of tasks
    try:
        with open(os.path.join(DATASET_DIR, "meta.json"), "r", encoding="utf-8") as f:
            meta = json.load(f)
        total_tasks = len(meta)
    except:
        total_tasks = 0

    for fname in os.listdir(LOG_DIR):
        if fname.endswith(".json") and not fname.startswith("annotators"):
            path = os.path.join(LOG_DIR, fname)
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                annotator_id = fname.replace(".json", "")
                unique_tasks = set()
                total_time = 0

                for d in data:
                    unique_tasks.add(d["content_id"])
                    if "time_spent" in d:
                        total_time += d["time_spent"]

                # Add a summary row with total_time
                all_data.append({
                    "annotator_id": annotator_id,
                    "age": annotators.get(annotator_id, {}).get("age", "N/A"),
                    "gender": annotators.get(annotator_id, {}).get("gender", "N/A"),
                    "completed": len(unique_tasks),
                    "total": total_tasks,
                    "total_time": total_time,
                    "summary": True
                })

    return all_data

# New endpoint: get all annotation entries (non-summary)
@app.get("/admin/all-annotations")
def get_all_annotations():
    all_annotations = []
    annotators = load_annotators()

    for fname in os.listdir(LOG_DIR):
        if fname.endswith(".json") and not fname.startswith("annotators"):
            path = os.path.join(LOG_DIR, fname)
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                annotator_id = fname.replace(".json", "")
                for d in data:
                    if "answer" in d:
                        answers = d.get("answer")
                        if isinstance(answers, list):
                            for ans in answers:
                                entry = {
                                    "content_id": d.get("content_id"),
                                    "model_id": d.get("model_id"),
                                    "input_type": d.get("input_type"),
                                    "answer": ans,
                                    "annotator_id": annotator_id,
                                    "session_id": d.get("session_id"),
                                    "timestamp": d.get("timestamp"),
                                    "time_spent": d.get("time_spent"),
                                    "age": annotators.get(annotator_id, {}).get("age"),
                                    "gender": annotators.get(annotator_id, {}).get("gender")
                                }
                                all_annotations.append(entry)
                        else:
                            entry = {
                                "content_id": d.get("content_id"),
                                "model_id": d.get("model_id"),
                                "input_type": d.get("input_type"),
                                "answer": answers,
                                "annotator_id": annotator_id,
                                "session_id": d.get("session_id"),
                                "timestamp": d.get("timestamp"),
                                "time_spent": d.get("time_spent"),
                                "age": annotators.get(annotator_id, {}).get("age"),
                                "gender": annotators.get(annotator_id, {}).get("gender")
                            }
                            all_annotations.append(entry)

    return all_annotations

# QType Summary endpoint for admin statistics
@app.get("/admin/qtype-summary")
def qtype_summary():
    qtype_counts = {}
    for fname in os.listdir(LOG_DIR):
        if fname.endswith(".json") and not fname.startswith("annotators"):
            path = os.path.join(LOG_DIR, fname)
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                for d in data:
                    content_id = d.get("content_id")
                    answer = d.get("answer", "N/A")
                    # Lookup task_type from image_db
                    if content_id in data_db:
                        task_type = data_db[content_id]["task_type"]
                        if task_type not in qtype_counts:
                            qtype_counts[task_type] = {}
                        qtype_counts[task_type][answer] = qtype_counts[task_type].get(answer, 0) + 1
    return qtype_counts


@app.post("/submit-annotation")
def submit_annotation(annotation: Annotation):
    record = annotation.dict()
    # Normalize bias_select answers to list
    try:
        task_type = data_db.get(record["content_id"], {}).get("task_type")
        if task_type in ["bias_select", 'youtube_rate']:
            if isinstance(record["answer"], str):
                record["answer"] = [a.strip() for a in record["answer"].split(",") if a.strip()]
            elif isinstance(record["answer"], list):
                record["answer"] = [a.strip() for a in record["answer"] if isinstance(a, str) and a.strip()]
    except Exception as e:
        print(f"Warning: Failed to normalize answer: {e}")
    record["timestamp"] = datetime.utcnow().isoformat()
    record["time_spent"] = annotation.time_spent
    record['model_id'] = data_db.get(record["content_id"], {}).get("model_id")
    record['input_type'] = data_db.get(record["content_id"], {}).get("input_type")
    # Save to in-memory list
    annotations.append(record)

    # Per-user log path
    user_csv = os.path.join(LOG_DIR, f"{annotation.annotator_id}.csv")

    # Save to JSON
    user_json = os.path.join(LOG_DIR, f"{annotation.annotator_id}.json")
    user_data = []
    
    if os.path.exists(user_json):
        with open(user_json, "r", encoding="utf-8") as f_json:
            user_data = json.load(f_json)
    
    user_data.append(record)
    
    with open(user_json, "w", encoding="utf-8") as f_json:
        json.dump(user_data, f_json, ensure_ascii=False, indent=2)

    # Save to CSV
    file_exists = os.path.isfile(user_csv)
    with open(user_csv, mode="a", newline='', encoding="utf-8") as f_csv:
        writer = csv.DictWriter(f_csv, fieldnames=["content_id", "answer", "annotator_id", "session_id", "time_spent", "timestamp", "model_id", "input_type"])        
        if not file_exists:
            writer.writeheader()
        writer.writerow(record)

    return {"status": "success", "message": "Annotation saved."}

# Serve annotation history for a specific annotator
@app.get("/annotations/{annotator_id}")
def get_annotations_by_user(annotator_id: str):
    path = os.path.join(LOG_DIR, f"{annotator_id}.json")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="No annotations found")
    
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)
    


@app.get("/api/progress/{annotator_id}")
async def get_progress(annotator_id: str):
    annotations = get_annotations_by_user(annotator_id)
    # Use regex to exclude content_ids matching youtube_rate_\d+_bias
    pattern = re.compile(r"youtube_rate_\d+_bias")
    filtered = [a for a in annotations if a["content_id"] and not pattern.search(a["content_id"])]
    meta = load_db(metadata)
    completed_set = [a["content_id"] for a in filtered]
    total = len(meta)
    return JSONResponse({
        "total": total,
        "completed": completed_set,
        "allTasksCompleted": len(completed_set) >= total
    })