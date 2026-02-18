const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Başlangıç sorularını yükle
let questions = require('./questions');

// Rotalar
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'player.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// Editör API
app.get('/api/questions', (req, res) => res.json(questions));
app.post('/api/questions', (req, res) => {
    const { user, pass, newQuestions } = req.body;
    if(user === 'ali' && pass === 'ali321') {
        questions = newQuestions;
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false });
    }
});

let players = {};
let currentQuestionIndex = 0;
let isGameRunning = false;
let answers = {};
let timerInterval = null;
let timeLeft = 10;

io.on('connection', (socket) => {
    socket.on('admin-login', (data) => {
        if(data.user === 'ali' && data.pass === 'ali321') socket.emit('login-success');
        else socket.emit('login-fail');
    });

    socket.on('player-join', (nickname) => {
        if (isGameRunning) return socket.emit('error-msg', 'Oturum devam ediyor.');
        players[socket.id] = { nickname, score: 0 };
        socket.emit('join-success');
        io.emit('update-player-list', Object.values(players));
    });

    socket.on('start-game', () => {
        if (!isGameRunning && questions.length > 0) {
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
                // Hız bonusu: Temel 500 + (Saniye x 50)
                player.score += 500 + (timeLeft * 50);
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
        const finalResults = Object.values(players).sort((a, b) => b.score - a.score);
        io.emit('game-over', finalResults);
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

    if(timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        io.emit('timer-tick', timeLeft);
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            endQuestionPhase();
        }
    }, 1000);
}

function endQuestionPhase() {
    const stats = [0, 0, 0, 0];
    Object.values(answers).forEach(ans => { if (ans >= 0) stats[ans]++; });
    
    io.emit('question-result-data', {
        correctIndex: questions[currentQuestionIndex].correct,
        correctText: questions[currentQuestionIndex].options[questions[currentQuestionIndex].correct],
        stats: stats,
        playersAnswers: answers
    });

    // 5 Saniye Analiz
    setTimeout(() => {
        const sorted = Object.values(players).sort((a, b) => b.score - a.score);
        io.emit('show-leaderboard', sorted);
        
        // 5 Saniye Liderlik Tablosu, sonra Yeni Soru
        setTimeout(() => {
            currentQuestionIndex++;
            sendNextQuestion();
        }, 5000);
    }, 5000); 
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sistem aktif.`));