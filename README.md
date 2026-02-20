终端 1：后端

cd D:\MetaGPT-workspace\notebook\out\notepad-web-app
.\.venv-backend\Scripts\python -m uvicorn backend.app.main:app --reload --port 8000

终端 2：前端

cd D:\MetaGPT-workspace\notebook\out\notepad-web-app\frontend
npm run dev



测试：

http://localhost:5174/

http://127.0.0.1:5174/
