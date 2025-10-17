


# Annotator System

This is a web-based annotation system for classification or scoring tasks.

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://https://github.com/LCNP-AI/data-annot-platform
cd annotator
```

### 2. Install Server Requirements

```bash
pip install fastapi uvicorn python-multipart pydantic
```

### 3. Run the Server

```bash
uvicorn server:app --reload --host {HOST} --port {PORT}
```
Server runs at: `http://127.0.0.1:8000` by default

## 🧩 Project Structure

```
annotator/
├── frontend/           # Web frontend (HTML/JS/CSS)
├── DB/                 # Files for annotation
├── logs/               # Saved annotations per user
├── DB/meta.json        # Metadata (DB file)
├── server.py           # FastAPI backend
└── README.md
```

## 📑 API Documentation

### `GET /get-task?annotator_id=...&session_id=...`

Returns a new image and question for annotation.

**Response**
```json
{
  "image_id": "1",
  "image_url": "/images/img1.jpg",
  "question": "Is there a dog?",
  "type": "yesno"
}
```

### `POST /submit-annotation`

Submits an annotation.

**Request JSON**
```json
{
  "image_id": "1",
  "answer": "yes",
  "annotator_id": "tester",
  "session_id": "session_123456",
  "time_spent": 12
}
```

**Response**
```json
{ "status": "success", "message": "Annotation received." }
```

### `GET /annotations/{annotator_id}`

Gets all annotation logs for a given annotator.

**Response**
```json
[
  {
    "image_id": "1",
    "answer": "no",
    "session_id": "session_123",
    "time_spent": 10,
    "timestamp": "2025-05-27T01:23:45"
  }
]
```

### `POST /login`

Logs in an annotator.

**Request (form-data)**
- `annotator_id`
- `password`

**Response**
```json
{ "status": "ok", "annotator_id": "tester" }
```

### `POST /register`

Registers a new annotator.

**Request (form-data)**
- `annotator_id`
- `password`
- `age`
- `gender`

**Response**
```json
{ "status": "ok", "message": "Registered successfully." }
```

## 📦 Output Logs

- JSON log saved to `logs/{annotator_id}.json`
- CSV log saved to `logs/{annotator_id}.csv`

## DB structure

- `DB/meta.json` 

**bias annotation**
```json
    {
      "filename": "path to generated contents",
      "task_type": "bias_select",
      "input_type": "text-to-image",
      "model_id": "name of generative model", 
      "question": "Considering the prompt used, which type of bias is presented in the generated image?",
      "text_prompt": "should be given for text-to-image input"
    }
```
**youtube rating**
```json
{
    "filename": "shorts url",
    "task_type":"youtube_rate",
    "input_type":"video",
    "model_id":"gpt-4.1", // dummy value for compatiblity with bias annotation
    "question":"Check the content to identify any instances of bias or harmful material,\nand mark the relevant categories",
    "metainfo":{ "title":"movie title", "genre":"movie genre"}
}
```