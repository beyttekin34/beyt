const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const questions = require('./questions');

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.redirect('/player.html'));

let players = {};
let currentQuestionIndex = 0;
let isGameRunning = false;
let answers = {};
let timer;
let timeLeft = 10; // Her soru 10 saniye

io.on('connection', (socket) => {
    socket.on('player-join', (nickname) => {
        if (isGameRunning) return socket.emit('error-msg', 'Oyun başladı, giremezsin!');
        players[socket.id] = { nickname, score: 0, correctCount: 0 };
        socket.emit('join-success');
        io.emit('update-player-list', Object.values(players));
    });

    socket.on('start-game', () => {
        isGameRunning = true;
        currentQuestionIndex = 0;
        sendNextQuestion();
    });

    socket.on('submit-answer', (answerIndex) => {
        if (!isGameRunning) return;
        const player = players[socket.id];
        if (player && answers[socket.id] === undefined) {
            answers[socket.id] = answerIndex;
            
            // Hız Odaklı Puanlama
            if (answerIndex === questions[currentQuestionIndex].correct) {
                // Temel 500 puan + (Kalan Saniye * 50) => 10 saniyede basan 1000 puan alır
                const speedBonus = timeLeft * 50; 
                player.score += 500 + speedBonus;
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
    timeLeft = 10; // Süreyi sıfırla

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
    const correctIndex = questions[currentQuestionIndex].correct;

    // Herkese detaylı verileri gönder
    io.emit('question-result-data', {
        correctIndex: correctIndex,
        correctText: questions[currentQuestionIndex].options[correctIndex],
        stats: stats,
        playersAnswers: answers // Kimin ne dediği (opsiyonel gösterim için)
    });

    setTimeout(() => {
        io.emit('show-leaderboard', Object.values(players).sort((a, b) => b.score - a.score).slice(0, 5));
        setTimeout(() => {
            currentQuestionIndex++;
            sendNextQuestion();
        }, 5000);
    }, 5000); 
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Oturum Yönetim Sistemi ${PORT} portu üzerinde aktif.`));