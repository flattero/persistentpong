const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const FPS = 60;

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const canvas = { width: 800, height: 500 };
const paddle = { width: 10, height: 100 };
const ballSize = 10;

let game = {
  startTime: Date.now(),
  left: { y: 200, score: 0 },
  right: { y: 200, score: 0 },
  ball: { x: 400, y: 250, vx: 5, vy: 5, speed: 5 }
};

const saveState = async () => {
  try {
    await fetch(`${REDIS_URL}/set/persistentpong`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value: JSON.stringify(game) })
    });
  } catch (err) {
    console.error("❌ Failed to save to Redis:", err);
  }
};

const loadState = async () => {
  try {
    const res = await fetch(`${REDIS_URL}/get/persistentpong`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
    const data = await res.json();
    if (data.result) {
      game = JSON.parse(data.result);
      game.startTime = Number(game.startTime); // ensure it's a number
      console.log("✅ Game state loaded from Redis.");
    } else {
      console.log("ℹ️ No saved state found. Starting fresh.");
    }
  } catch (err) {
    console.error("❌ Failed to load from Redis:", err);
  }
};

function update() {
  const { ball, left, right } = game;
  ball.x += ball.vx;
  ball.y += ball.vy;

  if (ball.y <= 0 || ball.y >= canvas.height - ballSize) ball.vy *= -1;

  left.y += ball.y > left.y + paddle.height / 2 ? 3 : -3;
  right.y += ball.y > right.y + paddle.height / 2 ? 3 : -3;

  left.y = Math.max(0, Math.min(canvas.height - paddle.height, left.y));
  right.y = Math.max(0, Math.min(canvas.height - paddle.height, right.y));

  const collideWith = (px, py) =>
    ball.x < px + paddle.width &&
    ball.x + ballSize > px &&
    ball.y < py + paddle.height &&
    ball.y + ballSize > py;

  if (collideWith(0, left.y)) {
    let angle = ((ball.y - (left.y + paddle.height / 2)) / (paddle.height / 2)) * Math.PI / 4;
    ball.vx = ball.speed * Math.cos(angle);
    ball.vy = ball.speed * Math.sin(angle);
  } else if (collideWith(canvas.width - paddle.width, right.y)) {
    let angle = ((ball.y - (right.y + paddle.height / 2)) / (paddle.height / 2)) * Math.PI / 4;
    ball.vx = -ball.speed * Math.cos(angle);
    ball.vy = ball.speed * Math.sin(angle);
  }

  if (ball.x < 0) {
    game.right.score++;
    resetBall(-1);
  } else if (ball.x > canvas.width) {
    game.left.score++;
    resetBall(1);
  }

  io.emit('state', game);
}

function resetBall(direction) {
  game.ball.x = canvas.width / 2;
  game.ball.y = canvas.height / 2;
  game.ball.vx = direction * game.ball.speed;
  game.ball.vy = 5;
}

// START
(async () => {
  await loadState();
  setInterval(update, 1000 / FPS);
  setInterval(saveState, 1000);
})();

// CLIENT CONNECTION HANDLER
io.on('connection', socket => {
  console.log('👋 New client connected');

  // Immediately send game state
  socket.emit('state', game);

  // Optional: periodically re-send (safety net)
  const interval = setInterval(() => {
    socket.emit('state', game);
  }, 1000);

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected');
    clearInterval(interval);
  });
});

app.use(express.static('public'));
server.listen(PORT, () => console.log(`🌍 PersistentPong running on port ${PORT}`));
