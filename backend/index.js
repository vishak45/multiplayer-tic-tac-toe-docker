import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*'
    }
});

// Store active games
const games = new Map();

function createGame(gameId) {
    return {
        id: gameId,
        board: Array(9).fill(null),
        players: [],
        currentTurn: 'X',
        winner: null,
        gameOver: false
    };
}

function checkWinner(board) {
    const winPatterns = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
        [0, 4, 8], [2, 4, 6]              // diagonals
    ];

    for (const pattern of winPatterns) {
        const [a, b, c] = pattern;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }

    if (board.every(cell => cell !== null)) {
        return 'draw';
    }

    return null;
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('joinGame', (gameId) => {
        let game = games.get(gameId);

        if (!game) {
            game = createGame(gameId);
            games.set(gameId, game);
        }

        if (game.players.length >= 2 && !game.players.includes(socket.id)) {
            socket.emit('error', 'Game is full');
            return;
        }

        if (!game.players.includes(socket.id)) {
            game.players.push(socket.id);
        }

        socket.join(gameId);
        socket.gameId = gameId;

        const playerSymbol = game.players[0] === socket.id ? 'X' : 'O';
        socket.playerSymbol = playerSymbol;

        socket.emit('gameJoined', {
            gameId,
            playerSymbol,
            board: game.board,
            currentTurn: game.currentTurn,
            playersCount: game.players.length
        });

        io.to(gameId).emit('playerJoined', {
            playersCount: game.players.length
        });

        if (game.players.length === 2) {
            io.to(gameId).emit('gameStart', {
                board: game.board,
                currentTurn: game.currentTurn
            });
        }
    });

    socket.on('makeMove', ({ position }) => {
        const gameId = socket.gameId;
        const game = games.get(gameId);

        if (!game || game.gameOver) return;

        if (game.players.length < 2) {
            socket.emit('error', 'Waiting for another player');
            return;
        }

        if (game.currentTurn !== socket.playerSymbol) {
            socket.emit('error', 'Not your turn');
            return;
        }

        if (game.board[position] !== null) {
            socket.emit('error', 'Cell already taken');
            return;
        }

        game.board[position] = socket.playerSymbol;
        game.currentTurn = game.currentTurn === 'X' ? 'O' : 'X';

        const winner = checkWinner(game.board);

        if (winner) {
            game.gameOver = true;
            game.winner = winner;
            io.to(gameId).emit('gameOver', {
                board: game.board,
                winner: winner === 'draw' ? null : winner,
                isDraw: winner === 'draw'
            });
        } else {
            io.to(gameId).emit('moveMade', {
                board: game.board,
                currentTurn: game.currentTurn
            });
        }
    });

    socket.on('restartGame', () => {
        const gameId = socket.gameId;
        const game = games.get(gameId);

        if (!game) return;

        game.board = Array(9).fill(null);
        game.currentTurn = 'X';
        game.winner = null;
        game.gameOver = false;

        io.to(gameId).emit('gameRestarted', {
            board: game.board,
            currentTurn: game.currentTurn
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const gameId = socket.gameId;
        const game = games.get(gameId);

        if (game) {
            game.players = game.players.filter(id => id !== socket.id);
            io.to(gameId).emit('playerLeft', {
                playersCount: game.players.length
            });

            if (game.players.length === 0) {
                games.delete(gameId);
            }
        }
    });
});

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.get('/api/test', (req, res) => {
    try {
        console.log("hello")
        res.status(200).json({status: "success", message: "hello world"});
    }
    catch(err) {
        res.status(500).json({status: "error", message: "internal server error"});
    }
});

server.listen(3000, () => {
    console.log('Server listening on port 3000!');
});