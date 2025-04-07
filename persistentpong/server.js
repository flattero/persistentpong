const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const FPS = 60;

const canvas = { width: 800, height: 500 };
const paddle = { width: 10, height: 100 };
const ballSize = 10;

const game = {
  startTime: Date.now(),
  left: { y: canvas.height / 2 - paddle.height / 2, score: 0 },
  right: { y: canvas.height / 2 - paddle.height / 2, score: 0 },
  ball: {
    x: canvas.width / 2,
    y: canvas.height / 2,
    vx: 5,
    vy: 5,
    speed: 5
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

setInterval(update, 1000 / FPS);

io.on('connection', socket => {
  socket.emit('state', game);
});

app.use(express.static('public'));

server.listen(PORT, () => console.log(`🌍 PersistentPong server running on port ${PORT}`));
