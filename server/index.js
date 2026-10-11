const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const rooms = {};
const DEFAULT_VIDEO = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

function getOrCreateRoom(roomId, socketId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      videoUrl: DEFAULT_VIDEO,
      isPlaying: false,
      currentTime: 0,
      lastUpdated: Date.now(),
      users: new Map(), // socketId -> username
      hostId: socketId, // First user to create room becomes Host
      activePoll: {
        question: 'Which movie should we watch next?',
        options: [
          { id: 1, text: 'Tears of Steel (Sci-Fi)', votes: 0 },
          { id: 2, text: 'Sintel (Fantasy / Quest)', votes: 0 },
          { id: 3, text: 'Big Buck Bunny (Animation)', votes: 0 }
        ]
      }
    };
  }
  return rooms[roomId];
}

function getCalculatedRoomTime(room) {
  let time = room.currentTime;
  if (room.isPlaying) {
    const elapsedSeconds = (Date.now() - room.lastUpdated) / 1000;
    time += elapsedSeconds;
  }
  return time;
}

// 2-Second Heartbeat for drift correction
setInterval(() => {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (room.isPlaying) {
      const accurateTime = getCalculatedRoomTime(room);
      io.to(roomId).emit('sync-heartbeat', {
        currentTime: accurateTime,
        serverTimestamp: Date.now()
      });
    }
  }
}, 2000);

io.on('connection', (socket) => {
  let currentRoomId = null;

  socket.on('latency-ping', (clientTimestamp, callback) => {
    if (typeof callback === 'function') {
      callback({ clientTimestamp, serverTimestamp: Date.now() });
    }
  });

// Join Room
  socket.on('join-room', ({ roomId, username }) => {
    currentRoomId = roomId;
    socket.join(roomId);

    const room = getOrCreateRoom(roomId, socket.id);
    room.users.set(socket.id, username || 'Viewer');

    const accurateTime = getCalculatedRoomTime(room);

    socket.emit('sync-state', {
      videoUrl: room.videoUrl,
      isPlaying: room.isPlaying,
      currentTime: accurateTime,
      poll: room.activePoll,
      hostId: room.hostId
    });

    // Broadcast updated member list and host
    const userList = Array.from(room.users.entries()).map(([id, name]) => ({
      id,
      name,
      isHost: id === room.hostId
    }));

    io.to(roomId).emit('room-users-update', {
      count: room.users.size,
      users: userList,
      hostId: room.hostId
    });

    io.to(roomId).emit('chat-message', {
      id: Date.now() + Math.random(),
      system: true,
      text: `${username || 'A friend'} joined the lounge.`
    });
  });

  // Host Transfer
  socket.on('transfer-host', ({ roomId, newHostId }) => {
    const room = rooms[roomId];
    if (room && room.hostId === socket.id) {
      room.hostId = newHostId;
      const userList = Array.from(room.users.entries()).map(([id, name]) => ({
        id,
        name,
        isHost: id === room.hostId
      }));

      io.to(roomId).emit('room-users-update', {
        count: room.users.size,
        users: userList,
        hostId: room.hostId
      });

      io.to(roomId).emit('chat-message', {
        id: Date.now() + Math.random(),
        system: true,
        text: `Host controls transferred to ${room.users.get(newHostId) || 'another user'}.`
      });
    }
  });
  socket.on('video-play', ({ roomId, currentTime }) => {
    const room = getOrCreateRoom(roomId);
    room.isPlaying = true;
    room.currentTime = currentTime;
    room.lastUpdated = Date.now();
    socket.to(roomId).emit('video-play', { currentTime });
  });

  socket.on('video-pause', ({ roomId, currentTime }) => {
    const room = getOrCreateRoom(roomId);
    room.isPlaying = false;
    room.currentTime = currentTime;
    room.lastUpdated = Date.now();
    socket.to(roomId).emit('video-pause', { currentTime });
  });

  socket.on('video-seek', ({ roomId, currentTime }) => {
    const room = getOrCreateRoom(roomId);
    room.currentTime = currentTime;
    room.lastUpdated = Date.now();
    socket.to(roomId).emit('video-seek', { currentTime });
  });

  socket.on('change-video', ({ roomId, videoUrl }) => {
    const room = getOrCreateRoom(roomId);
    room.videoUrl = videoUrl;
    room.currentTime = 0;
    room.isPlaying = false;
    room.lastUpdated = Date.now();
    io.to(roomId).emit('sync-state', {
      videoUrl: room.videoUrl,
      isPlaying: room.isPlaying,
      currentTime: 0,
      poll: room.activePoll
    });
  });

  socket.on('send-message', ({ roomId, message, username }) => {
    io.to(roomId).emit('chat-message', {
      id: Date.now() + Math.random(),
      username: username || 'Viewer',
      text: message,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  socket.on('send-reaction', ({ roomId, emoji }) => {
    io.to(roomId).emit('receive-reaction', {
      id: Date.now() + Math.random(),
      emoji,
      leftOffset: Math.floor(Math.random() * 75) + 12
    });
  });

  // Group Poll voting event
  socket.on('vote-poll', ({ roomId, optionId }) => {
    const room = getOrCreateRoom(roomId);
    if (!room.activePoll) return;
    const option = room.activePoll.options.find((opt) => opt.id === optionId);
    if (option) {
      option.votes += 1;
      io.to(roomId).emit('poll-updated', room.activePoll);
    }
  });

  socket.on('disconnect', () => {
    if (currentRoomId && rooms[currentRoomId]) {
      rooms[currentRoomId].users.delete(socket.id);
      io.to(currentRoomId).emit('room-users-update', { count: rooms[currentRoomId].users.size });
    }
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});