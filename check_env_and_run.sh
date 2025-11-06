echo "🔍 Checking environment for GreatUniHackDemo..."
echo "--------------------------------------------------------------"

if [ ! -d ".venv" ]; then
    echo "❌ Python virtual environment (.venv) not found."
    echo "➡️  Creating new virtual environment..."
    python3 -m venv .venv
fi

echo "✅ Virtual environment detected."
source .venv/bin/activate

if ! python3 -c "import fastapi" &>/dev/null; then
    echo "📦 Installing Python dependencies..."
    pip install -r backend/requirements.txt || pip install fastapi uvicorn firebase-admin python-dotenv
else
    echo "✅ Python dependencies OK."
fi

NODE_PATH=$(which node)
NPM_PATH=$(which npm)

if [ -z "$NODE_PATH" ] || [[ "$NODE_PATH" == *"/mnt/c/"* ]]; then
    echo "❌ Node.js not found or using Windows version!"
    echo "➡️  Installing Linux Node.js v20 (from NodeSource)..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
else
    echo "✅ Node.js detected at $NODE_PATH"
fi

NODE_VERSION=$(node -v 2>/dev/null)
if [[ $NODE_VERSION == v* ]]; then
    echo "✅ Node.js version: $NODE_VERSION"
else
    echo "❌ Node.js seems broken. Try reinstalling:"
    echo "   sudo apt remove nodejs npm -y && sudo apt install nodejs npm -y"
    exit 1
fi

if [ ! -f "backend/serviceAccountKey.json" ]; then
    echo "❌ Missing backend/serviceAccountKey.json!"
    echo "➡️  Please copy your Firebase key into backend/."
    exit 1
else
    echo "✅ Firebase service account key found."
fi

echo "--------------------------------------------------------------"
for port in 8000 5173; do
    if ss -ltn | grep -q ":$port"; then
        echo "⚠️  Port $port already in use. Trying to free it..."
        PID=$(sudo lsof -t -i:$port)
        if [ -n "$PID" ]; then
            sudo kill -9 $PID
            echo "🧹 Port $port freed."
        fi
    fi
done

cd frontend
if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install
else
    echo "✅ Frontend dependencies OK."
fi
cd ..

echo "--------------------------------------------------------------"
echo "🚀 Starting backend (FastAPI) and frontend (React + Vite)..."
echo "--------------------------------------------------------------"

source .venv/bin/activate
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000 &
BACK_PID=$!
cd ..

cd frontend
npm run dev &
FRONT_PID=$!
cd ..

echo "✅ Servers running!"
echo "--------------------------------------------------------------"
echo "🔹 Backend:  http://0.0.0.0:8000 (use the host's IP or 127.0.0.1 locally)"
echo "🔹 Frontend: http://0.0.0.0:5173 (use the host's IP or http://localhost:5173 locally)"
echo "--------------------------------------------------------------"
echo "Press [Ctrl+C] to stop both servers."
wait $BACK_PID $FRONT_PID
