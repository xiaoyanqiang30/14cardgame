// 客户端游戏逻辑
class FourteenGameClient {
    constructor() {
        this.socket = io();
        this.playerId = null;
        this.playerName = null;
        this.roomId = null;
        this.isHost = false;
        this.gameState = null;
        
        this.selectedPlayerCards = [];
        this.selectedFaceUpCard = null;
        
        this.setupEventListeners();
        this.showScreen('lobby');
    }
    
    // 设置事件监听
    setupEventListeners() {
        // 大厅事件
        document.getElementById('create-room-btn').addEventListener('click', () => this.createRoom());
        document.getElementById('join-room-btn').addEventListener('click', () => this.joinRoom());
        document.getElementById('start-game-btn').addEventListener('click', () => this.startGame());
        document.getElementById('leave-room-btn').addEventListener('click', () => this.leaveRoom());
        
        // 游戏事件
        document.getElementById('combine-btn').addEventListener('click', () => this.combineCards());
        document.getElementById('pass-btn').addEventListener('click', () => this.passTurn());
        document.getElementById('leave-game-btn').addEventListener('click', () => this.leaveGame());
        
        // 游戏结束事件
        document.getElementById('play-again-btn').addEventListener('click', () => this.playAgain());
        document.getElementById('back-to-lobby-btn').addEventListener('click', () => this.backToLobby());
        
        // Socket.IO事件
        this.socket.on('room-created', (roomId) => this.onRoomCreated(roomId));
        this.socket.on('player-joined', (data) => this.onPlayerJoined(data));
        this.socket.on('game-started', (room) => this.onGameStarted(room));
        this.socket.on('game-state-updated', (room) => this.onGameStateUpdated(room));
        this.socket.on('game-ended', (result) => this.onGameEnded(result));
        this.socket.on('player-left', (playerId) => this.onPlayerLeft(playerId));
        this.socket.on('error', (message) => this.showError(message));
    }
    
    // 创建房间
    createRoom() {
        const playerName = document.getElementById('player-name').value.trim();
        if (!playerName) {
            this.showError('请输入你的名字');
            return;
        }
        
        this.playerName = playerName;
        this.socket.emit('create-room', playerName);
    }
    
    // 加入房间
    joinRoom() {
        const playerName = document.getElementById('player-name').value.trim();
        const roomId = document.getElementById('room-id').value.trim().toUpperCase();
        
        if (!playerName) {
            this.showError('请输入你的名字');
            return;
        }
        
        if (!roomId) {
            this.showError('请输入房间号');
            return;
        }
        
        this.playerName = playerName;
        this.socket.emit('join-room', { roomId, playerName });
    }
    
    // 开始游戏
    startGame() {
        this.socket.emit('start-game');
    }
    
    // 离开房间
    leaveRoom() {
        this.socket.disconnect();
        this.socket.connect();
        this.showScreen('lobby');
        this.resetGame();
    }
    
    // 离开游戏
    leaveGame() {
        this.socket.disconnect();
        this.socket.connect();
        this.showScreen('lobby');
        this.resetGame();
    }
    
    // 组合得分
    combineCards() {
        this.socket.emit('combine-cards', {
            selectedPlayerCards: this.selectedPlayerCards,
            selectedFaceUpCard: this.selectedFaceUpCard
        });
        
        this.selectedPlayerCards = [];
        this.selectedFaceUpCard = null;
    }
    
    // 过牌
    passTurn() {
        this.socket.emit('pass-turn');
    }
    
    // 再玩一次
    playAgain() {
        if (this.isHost) {
            this.startGame();
        }
    }
    
    // 返回大厅
    backToLobby() {
        this.leaveGame();
    }
    
    // Socket事件处理
    onRoomCreated(roomId) {
        this.roomId = roomId;
        this.isHost = true;
        document.getElementById('room-id-display').textContent = roomId;
        this.showScreen('waiting-room');
        this.updateLobbyMessage('房间创建成功，等待其他玩家加入...', 'success');
        
        // 启用开始游戏按钮
        document.getElementById('start-game-btn').disabled = false;
    }
    
    onPlayerJoined(data) {
        const { player, room } = data;
        
        if (player.id === this.socket.id) {
            this.roomId = room.id;
            this.isHost = player.isHost;
            document.getElementById('room-id-display').textContent = room.id;
            this.showScreen('waiting-room');
            this.updateLobbyMessage(`成功加入房间 ${room.id}`, 'success');
            
            if (this.isHost) {
                document.getElementById('start-game-btn').disabled = false;
            }
        }
        
        this.updatePlayersList(room.players);
    }
    
    onGameStarted(room) {
        this.gameState = room;
        document.getElementById('game-room-id').textContent = room.id;
        this.showScreen('game-screen');
        this.updateGameUI();
    }
    
    onGameStateUpdated(room) {
        this.gameState = room;
        this.updateGameUI();
    }
    
    onGameEnded(result) {
        this.showScreen('game-over-screen');
        this.displayGameResult(result);
    }
    
    onPlayerLeft(playerId) {
        if (this.gameState) {
            // 从游戏状态中移除离开的玩家
            this.gameState.players = this.gameState.players.filter(p => p.id !== playerId);
            
            if (this.gameState.players.length === 1) {
                // 只剩一个玩家，游戏结束
                const result = {
                    isTie: false,
                    winner: this.gameState.players[0],
                    scores: this.gameState.players.map(p => ({ name: p.name, score: p.score }))
                };
                
                this.onGameEnded(result);
            } else {
                this.updateGameUI();
            }
        } else {
            // 在等待房间中有玩家离开
            this.updateLobbyMessage('有玩家离开了房间', 'error');
            document.getElementById('start-game-btn').disabled = true;
        }
    }
    
    // UI更新方法
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }
    
    updateLobbyMessage(message, type = 'info') {
        const messageElement = document.getElementById('lobby-message');
        messageElement.textContent = message;
        messageElement.className = `message ${type}`;
    }
    
    updateWaitingMessage(message, type = 'info') {
        const messageElement = document.getElementById('waiting-message');
        messageElement.textContent = message;
        messageElement.className = `message ${type}`;
    }
    
    updatePlayersList(players) {
        const playersList = document.getElementById('players-list');
        playersList.innerHTML = '';
        
        players.forEach(player => {
            const playerItem = document.createElement('div');
            playerItem.className = `player-item ${player.isHost ? 'host' : ''}`;
            playerItem.textContent = player.name;
            playersList.appendChild(playerItem);
        });
    }
    
    updateGameUI() {
        if (!this.gameState) return;
        
        const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
        const isMyTurn = currentPlayer.id === this.socket.id;
        
        // 更新玩家信息
        this.gameState.players.forEach((player, index) => {
            const playerInfo = document.getElementById(`player${index+1}-info`);
            const scoreElement = document.getElementById(`player${index+1}-score`);
            const statusElement = document.getElementById(`player${index+1}-status`);
            
            playerInfo.querySelector('h3').textContent = player.name;
            scoreElement.textContent = player.score;
            statusElement.textContent = player.isOpened ? '已开门' : '未开门';
            
            if (player.id === this.socket.id) {
                playerInfo.classList.add('current');
            } else {
                playerInfo.classList.remove('current');
            }
        });
        
        // 更新底牌
        this.updateFaceUpCards();
        
        // 更新玩家手牌（只显示自己的手牌）
        this.updatePlayerHand();
        
        // 更新得分板
        this.updateScoreBoard();
        
        // 更新游戏状态
        this.updateGameStatus();
        
        // 更新按钮状态
        this.updateButtonStates(isMyTurn);
        
        // 更新组合预览
        this.updateCombinationPreview();
        
        // 更新牌堆计数
        document.getElementById('deck-count').textContent = this.gameState.deck.length;
    }
    
    updateFaceUpCards() {
        const faceUpCardsContainer = document.getElementById('face-up-cards');
        faceUpCardsContainer.innerHTML = '';
        
        this.gameState.faceUpCards.forEach((card, index) => {
            const cardElement = document.createElement('div');
            cardElement.className = `card ${card.suit} ${this.selectedFaceUpCard === index ? 'selected' : ''}`;
            cardElement.innerHTML = `
                <div class="card-value">${card.display}</div>
                <div class="card-suit">${this.getSuitSymbol(card.suit)}</div>
            `;
            cardElement.addEventListener('click', () => this.selectFaceUpCard(index));
            faceUpCardsContainer.appendChild(cardElement);
        });
    }
    
    updatePlayerHand() {
        const playerCardsContainer = document.getElementById('player-cards');
        playerCardsContainer.innerHTML = '';
        
        // 只显示当前用户自己的手牌
        const currentPlayer = this.gameState.players.find(p => p.id === this.socket.id);
        if (!currentPlayer) return;
        
        document.getElementById('current-player-title').textContent = `${currentPlayer.name}的手牌`;
        
        currentPlayer.hand.forEach((card, index) => {
            const cardElement = document.createElement('div');
            cardElement.className = `card ${card.suit} ${this.selectedPlayerCards.includes(index) ? 'selected' : ''}`;
            cardElement.innerHTML = `
                <div class="card-value">${card.display}</div>
                <div class="card-suit">${this.getSuitSymbol(card.suit)}</div>
            `;
            cardElement.addEventListener('click', () => this.selectPlayerCard(index));
            playerCardsContainer.appendChild(cardElement);
        });
    }
    
    updateScoreBoard() {
        this.gameState.players.forEach((player, index) => {
            const scoreBoard = document.getElementById(`player${index+1}-scoreboard`);
            scoreBoard.querySelector('h3').textContent = player.name;
            scoreBoard.querySelector('.score span').textContent = player.score;
            scoreBoard.querySelector('.cards-count span').textContent = player.collectedCards.length;
            
            if (player.id === this.socket.id) {
                scoreBoard.classList.add('highlight');
            } else {
                scoreBoard.classList.remove('highlight');
            }
        });
    }
    
    updateGameStatus() {
        const statusElement = document.getElementById('game-status');
        const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
        const isMyTurn = currentPlayer.id === this.socket.id;
        
        let statusText = `轮到 ${currentPlayer.name} 行动`;
        if (this.gameState.isDeckEmpty) {
            statusText += ' (牌堆已空)';
        }
        if (!currentPlayer.isOpened) {
            statusText += ' - 需要开门（只能使用1张手牌）';
        }
        
        if (isMyTurn) {
            statusText += ' - <strong>轮到你了！</strong>';
        }
        
        statusElement.innerHTML = statusText;
    }
    
    updateButtonStates(isMyTurn) {
        document.getElementById('combine-btn').disabled = !isMyTurn || !this.canCombineCards();
        document.getElementById('pass-btn').disabled = !isMyTurn;
    }
    
    updateCombinationPreview() {
        const previewElement = document.getElementById('combination-preview');
        
        if (this.selectedPlayerCards.length === 0 || this.selectedFaceUpCard === null) {
            previewElement.textContent = '';
            return;
        }
        
        const currentPlayer = this.gameState.players.find(p => p.id === this.socket.id);
        if (!currentPlayer) return;
        
        const selectedCards = this.selectedPlayerCards.map(index => currentPlayer.hand[index]);
        const faceUpCard = this.gameState.faceUpCards[this.selectedFaceUpCard];
        
        let sum = faceUpCard.numeric;
        let cardTexts = [faceUpCard.display + this.getSuitSymbol(faceUpCard.suit)];
        
        for (let card of selectedCards) {
            sum += card.numeric;
            cardTexts.push(card.display + this.getSuitSymbol(card.suit));
        }
        
        previewElement.textContent = `当前组合: ${cardTexts.join(' + ')} = ${sum}分`;
        
        if (sum === 14) {
            previewElement.style.color = '#4CAF50';
        } else {
            previewElement.style.color = '#e74c3c';
        }
    }
    
    displayGameResult(result) {
        const resultElement = document.getElementById('game-result');
        const scoresElement = document.getElementById('final-scores');
        
        if (result.isTie) {
            resultElement.innerHTML = `<p>平局！两位玩家都获得了 ${result.scores[0].score} 分</p>`;
        } else {
            resultElement.innerHTML = `<p>获胜者: <strong>${result.winner.name}</strong>，得分: ${result.winner.score}</p>`;
        }
        
        scoresElement.innerHTML = '';
        result.scores.forEach(score => {
            const scoreItem = document.createElement('div');
            scoreItem.className = `final-score-item ${!result.isTie && score.name === result.winner.name ? 'winner' : ''}`;
            scoreItem.innerHTML = `
                <span>${score.name}</span>
                <span>${score.score} 分</span>
            `;
            scoresElement.appendChild(scoreItem);
        });
        
        // 只有房主可以再玩一次
        document.getElementById('play-again-btn').disabled = !this.isHost;
    }
    
    // 辅助方法
    selectPlayerCard(index) {
        if (!this.gameState) return;
        
        const currentPlayer = this.gameState.players.find(p => p.id === this.socket.id);
        if (!currentPlayer) return;
        
        // 检查是否是当前玩家回合
        if (this.gameState.players[this.gameState.currentPlayerIndex].id !== this.socket.id) {
            return;
        }
        
        // 如果还未开门，只能选择一张牌
        if (!currentPlayer.isOpened && this.selectedPlayerCards.length >= 1) {
            this.selectedPlayerCards = [index];
        } else {
            // 切换选择状态
            if (this.selectedPlayerCards.includes(index)) {
                this.selectedPlayerCards = this.selectedPlayerCards.filter(i => i !== index);
            } else {
                if (this.selectedPlayerCards.length < 2) {
                    this.selectedPlayerCards.push(index);
                }
            }
        }
        
        this.updateGameUI();
    }
    
    selectFaceUpCard(index) {
        if (!this.gameState) return;
        
        // 检查是否是当前玩家回合
        if (this.gameState.players[this.gameState.currentPlayerIndex].id !== this.socket.id) {
            return;
        }
        
        if (this.selectedFaceUpCard === index) {
            this.selectedFaceUpCard = null;
        } else {
            this.selectedFaceUpCard = index;
        }
        
        this.updateGameUI();
    }
    
    canCombineCards() {
        if (this.selectedPlayerCards.length === 0 || this.selectedFaceUpCard === null) {
            return false;
        }
        
        const currentPlayer = this.gameState.players.find(p => p.id === this.socket.id);
        if (!currentPlayer) return false;
        
        const selectedCards = this.selectedPlayerCards.map(index => currentPlayer.hand[index]);
        const faceUpCard = this.gameState.faceUpCards[this.selectedFaceUpCard];
        
        // 检查是否满足开门条件
        if (!currentPlayer.isOpened && this.selectedPlayerCards.length > 1) {
            return false;
        }
        
        // 检查牌堆为空时的限制
        if (this.gameState.isDeckEmpty && this.selectedPlayerCards.length > 1) {
            return false;
        }
        
        // 计算总和
        let sum = faceUpCard.numeric;
        for (let card of selectedCards) {
            sum += card.numeric;
        }
        
        return sum === 14;
    }
    
    getSuitSymbol(suit) {
        switch(suit) {
            case 'hearts': return '♥';
            case 'spades': return '♠';
            case 'diamonds': return '♦';
            case 'clubs': return '♣';
            case 'joker': return '王';
            default: return '';
        }
    }
    
    showError(message) {
        alert(`错误: ${message}`);
    }
    
    resetGame() {
        this.playerId = null;
        this.playerName = null;
        this.roomId = null;
        this.isHost = false;
        this.gameState = null;
        this.selectedPlayerCards = [];
        this.selectedFaceUpCard = null;
        
        document.getElementById('player-name').value = '';
        document.getElementById('room-id').value = '';
    }
}

// 初始化游戏
window.onload = function() {
    window.gameClient = new FourteenGameClient();
};