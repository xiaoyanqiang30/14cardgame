const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 游戏状态存储
const rooms = new Map();
const players = new Map();

// 生成唯一房间ID
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// 初始化牌堆
function initializeDeck() {
  const suits = ['hearts', 'spades', 'diamonds', 'clubs'];
  const values = [
    { display: 'A', numeric: 1 }, { display: '2', numeric: 2 },
    { display: '3', numeric: 3 }, { display: '4', numeric: 4 },
    { display: '5', numeric: 5 }, { display: '6', numeric: 6 },
    { display: '7', numeric: 7 }, { display: '8', numeric: 8 },
    { display: '9', numeric: 9 }, { display: '10', numeric: 10 },
    { display: 'J', numeric: 11 }, { display: 'Q', numeric: 12 },
    { display: 'K', numeric: 13 }
  ];
  
  const deck = [];
  
  // 添加普通牌
  for (let suit of suits) {
    for (let value of values) {
      deck.push({
        id: `${suit}-${value.display}`,
        suit: suit,
        display: value.display,
        numeric: value.numeric,
        isJoker: false
      });
    }
  }
  
  // 添加大小王
  deck.push({ id: 'joker-small', suit: 'joker', display: '小王', numeric: 5, isJoker: true });
  deck.push({ id: 'joker-big', suit: 'joker', display: '大王', numeric: 5, isJoker: true });
  
  // 洗牌
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  
  return deck;
}

// 计算单张牌得分
function calculateCardPoints(card) {
  if (card.isJoker) return 5;
  
  switch(card.suit) {
    case 'hearts': return 4;
    case 'spades': return 3;
    case 'diamonds': return 2;
    case 'clubs': return 1;
    default: return 0;
  }
}

// Socket.IO连接处理
io.on('connection', (socket) => {
  console.log('用户连接:', socket.id);
  
  // 创建房间
  socket.on('create-room', (playerName) => {
    const roomId = generateRoomId();
    const player = {
      id: socket.id,
      name: playerName,
      hand: [],
      score: 0,
      collectedCards: [],
      isOpened: false,
      isHost: true
    };
    
    const room = {
      id: roomId,
      players: [player],
      deck: [],
      faceUpCards: [],
      currentPlayerIndex: 0,
      isDeckEmpty: false,
      gameStarted: false
    };
    
    rooms.set(roomId, room);
    players.set(socket.id, { roomId, playerIndex: 0 });
    
    socket.join(roomId);
    socket.emit('room-created', roomId);
    socket.emit('player-joined', { player, room });
    
    console.log(`房间 ${roomId} 创建成功，玩家: ${playerName}`);
  });
  
  // 加入房间
  socket.on('join-room', (data) => {
    const { roomId, playerName } = data;
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('error', '房间不存在');
      return;
    }
    
    if (room.players.length >= 2) {
      socket.emit('error', '房间已满');
      return;
    }
    
    const player = {
      id: socket.id,
      name: playerName,
      hand: [],
      score: 0,
      collectedCards: [],
      isOpened: false,
      isHost: false
    };
    
    room.players.push(player);
    players.set(socket.id, { roomId, playerIndex: room.players.length - 1 });
    
    socket.join(roomId);
    
    // 通知所有玩家有新玩家加入
    io.to(roomId).emit('player-joined', { player, room });
    
    console.log(`玩家 ${playerName} 加入房间 ${roomId}`);
  });
  
  // 开始游戏
  socket.on('start-game', () => {
    const playerData = players.get(socket.id);
    if (!playerData) return;
    
    const room = rooms.get(playerData.roomId);
    if (!room || room.players.length < 2) return;
    
    // 只有房主可以开始游戏
    if (room.players[0].id !== socket.id) return;
    
    // 初始化游戏
    room.deck = initializeDeck();
    
    // 发牌
    room.players.forEach(player => {
      player.hand = room.deck.splice(0, 4);
    });
    
    // 发底牌
    room.faceUpCards = room.deck.splice(0, 2);
    
    room.gameStarted = true;
    room.currentPlayerIndex = 0;
    
    // 通知所有玩家游戏开始
    io.to(room.id).emit('game-started', room);
    
    console.log(`房间 ${room.id} 游戏开始`);
  });
  
  // 玩家操作：组合得分
  socket.on('combine-cards', (data) => {
    const { selectedPlayerCards, selectedFaceUpCard } = data;
    const playerData = players.get(socket.id);
    if (!playerData) return;
    
    const room = rooms.get(playerData.roomId);
    if (!room || !room.gameStarted) return;
    
    // 检查是否是当前玩家
    if (room.players[room.currentPlayerIndex].id !== socket.id) return;
    
    const currentPlayer = room.players[room.currentPlayerIndex];
    const selectedCards = selectedPlayerCards.map(index => currentPlayer.hand[index]);
    const faceUpCard = room.faceUpCards[selectedFaceUpCard];
    
    // 验证组合
    let sum = faceUpCard.numeric;
    for (let card of selectedCards) {
      sum += card.numeric;
    }
    
    if (sum !== 14) {
      socket.emit('error', '无效的组合');
      return;
    }
    
    // 检查开门规则
    if (!currentPlayer.isOpened && selectedPlayerCards.length > 1) {
      socket.emit('error', '开门前只能使用一张手牌');
      return;
    }
    
    // 检查牌堆空后的规则
    if (room.isDeckEmpty && selectedPlayerCards.length > 1) {
      socket.emit('error', '牌堆空后只能使用一张手牌');
      return;
    }
    
    // 计算得分
    let points = 0;
    const allCards = [...selectedCards, faceUpCard];
    
    for (let card of allCards) {
      points += calculateCardPoints(card);
    }
    
    // 更新玩家状态
    currentPlayer.score += points;
    currentPlayer.collectedCards.push(...allCards);
    
    if (!currentPlayer.isOpened) {
      currentPlayer.isOpened = true;
    }
    
    // 从手牌和底牌中移除已使用的牌
    selectedPlayerCards.sort((a, b) => b - a).forEach(index => {
      currentPlayer.hand.splice(index, 1);
    });
    room.faceUpCards.splice(selectedFaceUpCard, 1);
    
    // 抽牌
    let drawCount = 0;
    if (selectedPlayerCards.length === 1) {
      drawCount = 2;
    } else if (selectedPlayerCards.length === 2) {
      drawCount = 3;
    }
    
    // 检查牌堆是否足够
    if (room.deck.length >= drawCount) {
      currentPlayer.hand = currentPlayer.hand.concat(room.deck.splice(0, drawCount));
    } else if (room.deck.length > 0) {
      // 牌堆不足时，抽完剩余牌
      currentPlayer.hand = currentPlayer.hand.concat(room.deck);
      room.deck = [];
      room.isDeckEmpty = true;
    }
    
    // 打出一张牌作为底牌（除非牌堆只剩一张且刚好抽完）
    if ((!room.isDeckEmpty && currentPlayer.hand.length > 0) || 
        (room.isDeckEmpty && currentPlayer.hand.length > 4)) {
      if (currentPlayer.hand.length > 0) {
        room.faceUpCards.push(currentPlayer.hand.shift());
      }
    }
    
    // 检查游戏是否结束
    if (isGameOver(room)) {
      endGame(room);
      return;
    }
    
    // 切换到下一个玩家
    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
    
    // 通知所有玩家游戏状态更新
    io.to(room.id).emit('game-state-updated', room);
    
    console.log(`房间 ${room.id} 玩家 ${currentPlayer.name} 组合得分`);
  });
  
  // 玩家操作：过牌
  socket.on('pass-turn', () => {
    const playerData = players.get(socket.id);
    if (!playerData) return;
    
    const room = rooms.get(playerData.roomId);
    if (!room || !room.gameStarted) return;
    
    // 检查是否是当前玩家
    if (room.players[room.currentPlayerIndex].id !== socket.id) return;
    
    const currentPlayer = room.players[room.currentPlayerIndex];
    
    // 抽一张牌
    if (room.deck.length > 0) {
      currentPlayer.hand.push(room.deck.shift());
      
      // 打出一张牌作为底牌
      if (currentPlayer.hand.length > 0) {
        room.faceUpCards.push(currentPlayer.hand.shift());
      }
    } else {
      room.isDeckEmpty = true;
    }
    
    // 检查游戏是否结束
    if (isGameOver(room)) {
      endGame(room);
      return;
    }
    
    // 切换到下一个玩家
    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
    
    // 通知所有玩家游戏状态更新
    io.to(room.id).emit('game-state-updated', room);
    
    console.log(`房间 ${room.id} 玩家 ${currentPlayer.name} 过牌`);
  });
  
  // 断开连接处理
  socket.on('disconnect', () => {
    console.log('用户断开连接:', socket.id);
    
    const playerData = players.get(socket.id);
    if (!playerData) return;
    
    const room = rooms.get(playerData.roomId);
    if (!room) return;
    
    // 从房间中移除玩家
    room.players.splice(playerData.playerIndex, 1);
    
    // 如果房间空了，删除房间
    if (room.players.length === 0) {
      rooms.delete(room.id);
    } else {
      // 通知剩余玩家有玩家离开
      io.to(room.id).emit('player-left', socket.id);
    }
    
    players.delete(socket.id);
  });
});

// 检查游戏是否结束
function isGameOver(room) {
  // 牌堆为空且所有玩家手牌为空
  if (room.isDeckEmpty) {
    for (let player of room.players) {
      if (player.hand.length > 0) {
        return false;
      }
    }
    return true;
  }
  return false;
}

// 结束游戏
function endGame(room) {
  let winner = room.players[0];
  let isTie = false;
  
  for (let player of room.players) {
    if (player.score > winner.score) {
      winner = player;
      isTie = false;
    } else if (player.score === winner.score && player !== winner) {
      isTie = true;
    }
  }
  
  const result = {
    isTie,
    winner: isTie ? null : winner,
    scores: room.players.map(p => ({ name: p.name, score: p.score }))
  };
  
  io.to(room.id).emit('game-ended', result);
  
  // 重置房间状态
  room.gameStarted = false;
  room.deck = [];
  room.faceUpCards = [];
  room.currentPlayerIndex = 0;
  room.isDeckEmpty = false;
  
  room.players.forEach(player => {
    player.hand = [];
    player.collectedCards = [];
    player.isOpened = false;
    // 注意：不清除分数，以便显示最终得分
  });
  
  console.log(`房间 ${room.id} 游戏结束`);
}

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`游戏服务器运行在端口 ${PORT}`);
});