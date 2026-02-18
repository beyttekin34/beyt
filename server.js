const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const questions = require('./questions');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

let players = {};
let currentQuestionIndex = 0;
let isGameRunning = false;
let answers = {};
let timer;
let timeLeft = 10;

io.on('connection', (socket) => {
    // Admin Giriş Kontrolü
    socket.on('admin-login', (data) => {
        if(data.user === 'ali' && data.pass === 'ali321') {
            socket.emit('login-success');
        } else {
            socket.emit('login-fail', 'Yetkisiz Erişim!');
        }
    });

    socket.on('player-join', (nickname) => {
        if (isGameRunning) return socket.emit('error-msg', 'Oturum devam ediyor.');
        players[socket.id] = { nickname, score: 0, correctCount: 0 };
        socket.emit('join-success');
        io.emit('update-player-list', Object.values(players));
    });

    socket.on('start-game', () => {
        if (!isGameRunning) {
            isGameRunning = true;
            currentQuestionIndex = 0;
            sendNextQuestion();
        }
    });

    socket.on('submit-answer', (answerIndex) => {
        if (!isGameRunning || answers[socket.id] !== undefined) return;
        const player = players[socket.id];
        if (player) {
            answers[socket.id] = answerIndex;
            if (answerIndex === questions[currentQuestionIndex].correct) {
                const bonus = timeLeft * 50;
                player.score += 500 + bonus;
                player.correctCount += 1;
            }
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('update-player-list', Object.values(players));
    });
});

function sendNextQuestion() {
    if (currentQuestionIndex >= questions.length) {
        io.emit('game-over', Object.values(players).sort((a, b) => b.score - a.score));
        isGameRunning = false;
        return;
    }

    answers = {}; 
    timeLeft = 10;
    
    io.emit('new-question', { 
        text: questions[currentQuestionIndex].text, 
        options: questions[currentQuestionIndex].options,
        qIndex: currentQuestionIndex + 1,
        total: questions.length,
        time: timeLeft
    });

    clearInterval(timer);
    timer = setInterval(() => {
        timeLeft--;
        io.emit('timer-tick', timeLeft);
        if (timeLeft <= 0) {
            clearInterval(timer);
            endQuestionPhase();
        }
    }, 1000);
}

function endQuestionPhase() {
    const stats = [0, 0, 0, 0];
    Object.values(answers).forEach(ans => { if (ans >= 0) stats[ans]++; });
    const correctIdx = questions[currentQuestionIndex].correct;

    // 1. AŞAMA: İstatistikleri ve Doğru Cevabı Gönder (5 saniye)
    io.emit('question-result-data', {
        correctIndex: correctIdx,
        correctText: questions[currentQuestionIndex].options[correctIdx],
        stats: stats,
        playersAnswers: answers
    });

    // 2. AŞAMA: Puan Durumunu Gönder (5 saniye sonra, 5 saniye boyunca)
    setTimeout(() => {
        const sorted = Object.values(players).sort((a, b) => b.score - a.score);
        io.emit('show-leaderboard', sorted);
        
        // 3. AŞAMA: Bir sonraki soruya geç
        setTimeout(() => {
            currentQuestionIndex++;
            sendNextQuestion();
        }, 5000);
    }, 5000); 
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sistem ${PORT} üzerinde aktif.`));