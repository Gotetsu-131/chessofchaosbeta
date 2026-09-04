// Global State
const state = {
    screen: 'screen-lobby',
    selectedVariants: [],
    difficulty: 'medium',
    playerColor: 'w',
    turn: 'w',
    board: [],
    selectedSquare: null,
    validMoves: [],
    castlingRights: { 
        w: { k: true, q: true, movedKing: false, movedRookK: false, movedRookQ: false }, 
        b: { k: true, q: true, movedKing: false, movedRookK: false, movedRookQ: false } 
    },
    kingPositions: { w: null, b: null },
    rookPositions: { w: { k: null, q: null }, b: { k: null, q: null } },
    moveHistory: [],
    fullMoveNumber: 1,
    isGameOver: false,
    capturedPoints: { w: 0, b: 0 }
};

// Giá trị điểm ăn quân đối phương
const PIECE_VALUES = {
    'p': 1,  // tốt
    'n': 3,  // mã
    'b': 3,  // tượng
    'r': 5,  // xe
    'q': 10, // hậu
    'k': 3   // vua (anti chess)
};

const PIECE_UNICODE = {
    'w': { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
    'b': { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

const screens = document.querySelectorAll('.screen');
const modal = document.getElementById('game-over-modal');
const boardEl = document.getElementById('chess-board');
const historyLogEl = document.getElementById('move-history-log');

let stockfishWorker = null;

function initStockfish() {
    if (stockfishWorker) stockfishWorker.terminate();
    
    const stockfishUrl = 'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js';
    
    fetch(stockfishUrl)
        .then(res => res.blob())
        .then(blob => {
            const workerUrl = URL.createObjectURL(blob);
            stockfishWorker = new Worker(workerUrl);
            stockfishWorker.onmessage = handleStockfishMessage;
            stockfishWorker.postMessage('uci');
            stockfishWorker.postMessage('ucinewgame');
        })
        .catch(err => {
            console.error("Không thể tải Stockfish. Fallback về bot ngẫu nhiên:", err);
        });
}

function handleStockfishMessage(event) {
    const line = event.data;
    if (typeof line !== 'string') return;

    if (line.startsWith('bestmove')) {
        const moveStr = line.split(' ')[1];
        if (moveStr && moveStr !== '(none)') {
            executeStockfishMove(moveStr);
        } else {
            fallbackRandomMove();
        }
    }
}

function showScreen(id) {
    screens.forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    state.screen = id;
}

document.getElementById('btn-to-variants').onclick = () => showScreen('screen-variants');
document.getElementById('btn-to-lobby').onclick = () => showScreen('screen-lobby');
document.getElementById('btn-to-setup').onclick = () => showScreen('screen-setup');
document.getElementById('btn-to-variants-back').onclick = () => showScreen('screen-variants');
document.getElementById('btn-quit').onclick = () => showScreen('screen-setup');

document.getElementById('btn-modal-lobby').onclick = () => {
    modal.classList.add('hidden');
    showScreen('screen-lobby');
};

document.getElementById('btn-restart').onclick = () => {
    modal.classList.add('hidden');
    initGame();
};

document.getElementById('btn-start-game').onclick = () => {
    state.selectedVariants = Array.from(document.querySelectorAll('.variant-toggle:checked')).map(cb => cb.value);
    state.difficulty = document.querySelector('input[name="difficulty"]:checked').value;
    
    let side = document.querySelector('input[name="side"]:checked').value;
    if (side === 'random') side = Math.random() < 0.5 ? 'w' : 'b';
    state.playerColor = side;

    showScreen('screen-game');
    initGame();
};

// --- LOGIC GAME ---

function initGame() {
    state.turn = 'w';
    state.isGameOver = false;
    state.selectedSquare = null;
    state.validMoves = [];
    state.moveHistory = [];
    state.fullMoveNumber = 1;
    state.capturedPoints = { w: 0, b: 0 };
    
    if (historyLogEl) historyLogEl.innerHTML = '';
    
    document.getElementById('active-variants-text').innerText = 
        state.selectedVariants.length > 0 ? state.selectedVariants.join(', ') : 'Tiêu chuẩn';

    setupInitialBoard();
    renderBoard();
    initStockfish();

    if (state.turn !== state.playerColor) {
        setTimeout(requestStockfishMove, 500);
    }
}

function setupInitialBoard() {
    state.board = Array(8).fill(null).map(() => Array(8).fill(null));

    let backrank = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

    if (state.selectedVariants.includes('chess960')) {
        backrank = generateChess960Rank();
    }

    for (let c = 0; c < 8; c++) {
        state.board[1][c] = { type: 'p', color: 'b' };
        state.board[6][c] = { type: 'p', color: 'w' };
        state.board[0][c] = { type: backrank[c], color: 'b' };
        state.board[7][c] = { type: backrank[c], color: 'w' };
    }

    const kingCol = backrank.indexOf('k');
    state.kingPositions.w = { r: 7, c: kingCol };
    state.kingPositions.b = { r: 0, c: kingCol };

    let leftRookCol = -1, rightRookCol = -1;
    for (let c = 0; c < 8; c++) {
        if (backrank[c] === 'r') {
            if (c < kingCol) leftRookCol = c;
            else if (c > kingCol) rightRookCol = c;
        }
    }

    state.rookPositions.w = { q: { r: 7, c: leftRookCol }, k: { r: 7, c: rightRookCol } };
    state.rookPositions.b = { q: { r: 0, c: leftRookCol }, k: { r: 0, c: rightRookCol } };

    state.castlingRights = { 
        w: { k: rightRookCol !== -1, q: leftRookCol !== -1, movedKing: false, movedRookK: false, movedRookQ: false }, 
        b: { k: rightRookCol !== -1, q: leftRookCol !== -1, movedKing: false, movedRookK: false, movedRookQ: false } 
    };
}

function generateChess960Rank() {
    let rank = Array(8).fill(null);
    let b1 = [0, 2, 4, 6][Math.floor(Math.random() * 4)];
    let b2 = [1, 3, 5, 7][Math.floor(Math.random() * 4)];
    rank[b1] = 'b'; rank[b2] = 'b';

    let empty = rank.map((v, i) => v === null ? i : null).filter(v => v !== null);
    let q = empty.splice(Math.floor(Math.random() * empty.length), 1)[0];
    let n1 = empty.splice(Math.floor(Math.random() * empty.length), 1)[0];
    let n2 = empty.splice(Math.floor(Math.random() * empty.length), 1)[0];
    rank[q] = 'q'; rank[n1] = 'n'; rank[n2] = 'n';

    empty.sort((a, b) => a - b);
    rank[empty[0]] = 'r';
    rank[empty[1]] = 'k';
    rank[empty[2]] = 'r';

    return rank;
}

function renderBoard() {
    boardEl.innerHTML = '';
    const isFlipped = state.playerColor === 'b';

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const row = isFlipped ? 7 - r : r;
            const col = isFlipped ? 7 - c : c;

            const square = document.createElement('div');
            square.className = `square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
            square.dataset.row = row;
            square.dataset.col = col;

            if (state.selectedSquare && state.selectedSquare.r === row && state.selectedSquare.c === col) {
                square.classList.add('selected');
            }
            if (state.validMoves.some(m => m.r === row && m.c === col)) {
                square.classList.add('possible-move');
            }

            const piece = state.board[row][col];
            if (piece) {
                const pieceEl = document.createElement('span');
                pieceEl.className = `piece ${piece.color === 'w' ? 'white' : 'black'}`;
                pieceEl.innerText = PIECE_UNICODE[piece.color][piece.type];
                square.appendChild(pieceEl);
            }

            square.onclick = () => handleSquareClick(row, col);
            boardEl.appendChild(square);
        }
    }

    const inCheck = !state.selectedVariants.includes('antiChess') && isKingInCheck(state.turn, state.board);
    document.getElementById('turn-indicator').innerText = 
        (state.turn === 'w' ? 'Trắng' : 'Đen') + (inCheck ? ' (ĐANG BỊ CHIẾU!)' : '');

    const scoreEl = document.getElementById('player-score-text');
    if (scoreEl) {
        scoreEl.innerText = `${state.capturedPoints[state.playerColor] || 0}đ`;
    }
}

function handleSquareClick(r, c) {
    if (state.isGameOver || state.turn !== state.playerColor) return;

    const clickedPiece = state.board[r][c];

    // 1. Nếu đang chọn Vua và bấm vào Xe để Nhập thành
    if (state.selectedSquare) {
        const selPiece = state.board[state.selectedSquare.r][state.selectedSquare.c];
        const move = state.validMoves.find(m => m.r === r && m.c === c);

        if (move && move.isCastle) {
            executeCastling(state.turn, move.castleSide);
            recordHistory({ type: 'castle', side: move.castleSide });
            endTurn();
            return;
        }
    }

    // 2. Chọn quân cờ của mình
    if (clickedPiece && clickedPiece.color === state.turn) {
        state.selectedSquare = { r, c };
        state.validMoves = getValidMoves(r, c);
        renderBoard();
        return;
    }

    // 3. Thực hiện nước đi di chuyển bình thường
    if (state.selectedSquare) {
        const move = state.validMoves.find(m => m.r === r && m.c === c);
        if (move) {
            const p = state.board[state.selectedSquare.r][state.selectedSquare.c];
            const target = state.board[r][c];
            
            applyMoveToBoard(state.selectedSquare, { r, c }, state.board);
            recordHistory({ type: 'normal', piece: p, from: state.selectedSquare, to: { r, c }, captured: target });
            endTurn();
        } else {
            state.selectedSquare = null;
            state.validMoves = [];
            renderBoard();
        }
    }
}

function getValidMoves(r, c) {
    const piece = state.board[r][c];
    if (!piece) return [];

    const isAnti = state.selectedVariants.includes('antiChess');
    const mustCapture = isAnti && hasAnyCaptures(piece.color);
    
    let rawMoves = getRawMoves(r, c, state.board);

    if (isAnti) {
        if (mustCapture) {
            rawMoves = rawMoves.filter(m => state.board[m.r][m.c] !== null);
        }
        return rawMoves;
    }

    rawMoves = rawMoves.filter(m => {
        const tempBoard = cloneBoard(state.board);
        applyMoveToBoard({ r, c }, m, tempBoard);
        return !isKingInCheck(piece.color, tempBoard);
    });

    // Thêm ô của quân Xe làm nước đi hợp lệ cho Vua khi đủ điều kiện Nhập Thành (Chess960 & Tiêu chuẩn)
    if (piece.type === 'k') {
        ['k', 'q'].forEach(side => {
            if (canCastle(piece.color, side, state.board)) {
                const rookObj = state.rookPositions[piece.color][side];
                if (rookObj) {
                    rawMoves.push({ r: rookObj.r, c: rookObj.c, isCastle: true, castleSide: side });
                }
            }
        });
    }

    return rawMoves;
}

function hasAnyCaptures(color) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (state.board[r][c] && state.board[r][c].color === color) {
                const moves = getRawMoves(r, c, state.board);
                if (moves.some(m => state.board[m.r][m.c] !== null && state.board[m.r][m.c].color !== color)) return true;
            }
        }
    }
    return false;
}

function hasAnyLegalMoves(color) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (state.board[r][c] && state.board[r][c].color === color) {
                if (getValidMoves(r, c).length > 0) return true;
            }
        }
    }
    return false;
}

function isKingInCheck(color, board) {
    if (state.selectedVariants.includes('antiChess')) return false;

    let kingPos = null;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] && board[r][c].type === 'k' && board[r][c].color === color) {
                kingPos = { r, c };
                break;
            }
        }
    }
    if (!kingPos) return false;

    const enemyColor = color === 'w' ? 'b' : 'w';
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] && board[r][c].color === enemyColor) {
                const enemyMoves = getRawMoves(r, c, board);
                if (enemyMoves.some(m => m.r === kingPos.r && m.c === kingPos.c)) {
                    return true;
                }
            }
        }
    }
    return false;
}

function getRawMoves(r, c, board) {
    const piece = board[r][c];
    const moves = [];
    const dir = piece.color === 'w' ? -1 : 1;

    if (piece.type === 'p') {
        if (r + dir >= 0 && r + dir < 8 && !board[r + dir][c]) {
            moves.push({ r: r + dir, c });
            if ((piece.color === 'w' && r === 6) || (piece.color === 'b' && r === 1)) {
                if (!board[r + 2 * dir][c]) moves.push({ r: r + 2 * dir, c });
            }
        }
        [-1, 1].forEach(dc => {
            if (c + dc >= 0 && c + dc < 8 && r + dir >= 0 && r + dir < 8) {
                const target = board[r + dir][c + dc];
                if (target && target.color !== piece.color) moves.push({ r: r + dir, c: c + dc });
            }
        });
    }

    if (piece.type === 'n') {
        const offsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        offsets.forEach(([dr, dc]) => {
            const nr = r + dr, nc = c + dc;
            if (isValidSq(nr, nc) && (!board[nr][nc] || board[nr][nc].color !== piece.color)) {
                moves.push({ r: nr, c: nc });
            }
        });
    }

    if (['r', 'b', 'q'].includes(piece.type)) {
        const dirs = [];
        if (['r', 'q'].includes(piece.type)) dirs.push([-1,0],[1,0],[0,-1],[0,1]);
        if (['b', 'q'].includes(piece.type)) dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);

        dirs.forEach(([dr, dc]) => {
            let nr = r + dr, nc = c + dc;
            while (isValidSq(nr, nc)) {
                if (!board[nr][nc]) {
                    moves.push({ r: nr, c: nc });
                } else {
                    if (board[nr][nc].color !== piece.color) moves.push({ r: nr, c: nc });
                    break;
                }
                nr += dr; nc += dc;
            }
        });
    }

    if (piece.type === 'k') {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = r + dr, nc = c + dc;
                if (isValidSq(nr, nc) && (!board[nr][nc] || board[nr][nc].color !== piece.color)) {
                    moves.push({ r: nr, c: nc });
                }
            }
        }
    }

    return moves;
}

function isValidSq(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

function cloneBoard(board) {
    return board.map(row => row.map(cell => cell ? { ...cell } : null));
}

function applyMoveToBoard(from, to, board) {
    const piece = board[from.r][from.c];
    const target = board[to.r][to.c];

    // Cộng điểm ăn quân đối phương
    if (board === state.board && target && target.color !== piece.color) {
        state.capturedPoints[piece.color] += PIECE_VALUES[target.type] || 0;
    }

    if (board === state.board) {
        if (piece.type === 'k') state.castlingRights[piece.color].movedKing = true;
        if (piece.type === 'r') {
            if (state.rookPositions[piece.color].k && from.c === state.rookPositions[piece.color].k.c) 
                state.castlingRights[piece.color].movedRookK = true;
            if (state.rookPositions[piece.color].q && from.c === state.rookPositions[piece.color].q.c) 
                state.castlingRights[piece.color].movedRookQ = true;
        }
    }

    board[to.r][to.c] = piece;
    board[from.r][from.c] = null;

    if (piece.type === 'p' && (to.r === 0 || to.r === 7)) {
        piece.type = 'q';
    }

    if (piece.type === 'k' && board === state.board) {
        state.kingPositions[piece.color] = { r: to.r, c: to.c };
    }

    if (state.selectedVariants.includes('atomic') && target) {
        triggerExplosionOnBoard(to.r, to.c, board, piece.color);
    }
}

function triggerExplosionOnBoard(r, c, board, attackerColor) {
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (isValidSq(nr, nc)) {
                // Bỏ qua ô trung tâm (đã được tính điểm ở applyMoveToBoard)
                if (dr === 0 && dc === 0) continue;
                const p = board[nr][nc];
                if (p && p.type !== 'p') {
                    if (board === state.board && attackerColor && p.color !== attackerColor) {
                        state.capturedPoints[attackerColor] += PIECE_VALUES[p.type] || 0;
                    }
                    board[nr][nc] = null;
                }
            }
        }
    }
    board[r][c] = null;
}

function canCastle(color, side, board) {
    if (state.selectedVariants.includes('antiChess')) return false;
    const rights = state.castlingRights[color];
    if (rights.movedKing) return false;
    if (side === 'k' && rights.movedRookK) return false;
    if (side === 'q' && rights.movedRookQ) return false;

    if (isKingInCheck(color, board)) return false;

    const row = color === 'w' ? 7 : 0;
    const kingCol = state.kingPositions[color].c;
    const rookObj = state.rookPositions[color][side];
    if (!rookObj || rookObj.c === -1) return false;
    
    const rookCol = rookObj.c;
    const targetKingCol = side === 'k' ? 6 : 2;
    const targetRookCol = side === 'k' ? 5 : 3;

    const minC = Math.min(kingCol, rookCol, targetKingCol, targetRookCol);
    const maxC = Math.max(kingCol, rookCol, targetKingCol, targetRookCol);

    for (let c = minC; c <= maxC; c++) {
        if (c === kingCol || c === rookCol) continue;
        if (board[row][c] !== null) return false;
    }

    const step = targetKingCol > kingCol ? 1 : (targetKingCol < kingCol ? -1 : 0);
    if (step !== 0) {
        for (let c = kingCol + step; c !== targetKingCol + step; c += step) {
            const tempBoard = cloneBoard(board);
            tempBoard[row][c] = tempBoard[row][kingCol];
            tempBoard[row][kingCol] = null;
            if (isKingInCheck(color, tempBoard)) return false;
        }
    }

    return true;
}

function executeCastling(color, side) {
    const row = color === 'w' ? 7 : 0;
    const kingCol = state.kingPositions[color].c;
    const rookCol = state.rookPositions[color][side].c;

    const targetKingCol = side === 'k' ? 6 : 2;
    const targetRookCol = side === 'k' ? 5 : 3;

    state.board[row][kingCol] = null;
    state.board[row][rookCol] = null;

    state.board[row][targetKingCol] = { type: 'k', color };
    state.board[row][targetRookCol] = { type: 'r', color };

    state.kingPositions[color] = { r: row, c: targetKingCol };
    state.castlingRights[color].movedKing = true;
}

function recordHistory(moveData) {
    let str = "";
    if (moveData.type === 'castle') {
        str = moveData.side === 'k' ? 'O-O' : 'O-O-O';
    } else {
        const pChar = moveData.piece.type === 'p' ? '' : moveData.piece.type.toUpperCase();
        const cap = moveData.captured ? 'x' : '';
        const dest = `${FILES[moveData.to.c]}${8 - moveData.to.r}`;
        str = `${pChar}${cap}${dest}`;
    }

    if (state.turn === 'w') {
        state.moveHistory.push(`${state.fullMoveNumber}. ${str}`);
    } else {
        state.moveHistory[state.moveHistory.length - 1] += ` ${str}`;
        state.fullMoveNumber++;
    }

    if (historyLogEl) {
        historyLogEl.innerHTML = state.moveHistory.join('<br>');
        historyLogEl.scrollTop = historyLogEl.scrollHeight;
    }
}

function endTurn() {
    state.selectedSquare = null;
    state.validMoves = [];

    if (checkVariantWinConditions()) return;

    const nextTurn = state.turn === 'w' ? 'b' : 'w';
    state.turn = nextTurn;

    const hasLegalMove = hasAnyLegalMoves(state.turn);

    if (!hasLegalMove) {
        if (state.selectedVariants.includes('antiChess')) {
            const winnerText = state.turn === 'w' ? 'Trắng' : 'Đen';
            endGame(
                state.turn === state.playerColor ? 'win' : 'lose', 
                `Bên ${winnerText} hết nước đi hợp lệ (bị bế tắc) và đã THẮNG!`
            );
        } else {
            if (isKingInCheck(state.turn, state.board)) {
                endGame(state.turn === state.playerColor ? 'lose' : 'win', 'Chiếu Hết (Checkmate)!');
            } else {
                endGame('draw', 'Hòa cờ do hết nước đi (Stalemate)!');
            }
        }
        return;
    }

    renderBoard();

    if (!state.isGameOver && state.turn !== state.playerColor) {
        setTimeout(requestStockfishMove, 300);
    }
}

function checkVariantWinConditions() {
    if (state.selectedVariants.includes('atomic')) {
        for (let col of ['w', 'b']) {
            if (!state.kingPositions[col] || !state.board[state.kingPositions[col].r][state.kingPositions[col].c]) {
                endGame(col !== state.playerColor ? 'win' : 'lose', 'Vua đã bị nổ tung!');
                return true;
            }
        }
    }

    if (state.selectedVariants.includes('kingOfTheHill')) {
        const center = [{r:3,c:3}, {r:3,c:4}, {r:4,c:3}, {r:4,c:4}];
        for (let col of ['w', 'b']) {
            const kp = state.kingPositions[col];
            if (kp && center.some(sq => sq.r === kp.r && sq.c === kp.c)) {
                endGame(col === state.playerColor ? 'win' : 'lose', `Vua đã chiếm lĩnh trung tâm!`);
                return true;
            }
        }
    }

    if (state.selectedVariants.includes('antiChess')) {
        for (let col of ['w', 'b']) {
            let count = 0;
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    if (state.board[r][c] && state.board[r][c].color === col) count++;
                }
            }

            if (count === 0) {
                const winnerText = col === 'w' ? 'Trắng' : 'Đen';
                endGame(
                    col === state.playerColor ? 'win' : 'lose', 
                    `Bên ${winnerText} đã mất hết toàn bộ quân cờ và THẮNG CUỘC!`
                );
                return true;
            }
        }
    }

    return false;
}

function endGame(result, reason) {
    state.isGameOver = true;
    const titleEl = document.getElementById('modal-title');
    const msgEl = document.getElementById('modal-message');

    const isAnti = state.selectedVariants.includes('antiChess');
    const playerScore = state.capturedPoints[state.playerColor] || 0;

    // Kiểm tra các cấp độ thưởng theo điều kiện
    let rewardText = "Chúc may mắn lần sau";
    let isEligible = false;

    if (result === 'win') {
        if (isAnti) {
            if (playerScore <= 20) {
                rewardText = "Thưởng Lớn";
                isEligible = true;
            } else if (playerScore <= 27) {
                rewardText = "Thưởng nhỏ";
                isEligible = true;
            }
        } else {
            if (playerScore >= 25) {
                rewardText = "Thưởng Lớn";
                isEligible = true;
            } else if (playerScore >= 15) {
                rewardText = "Thưởng nhỏ";
                isEligible = true;
            }
        }

        // ĐIỀU KIỆN MỚI: Ở độ khó Dễ (easy), mọi phần thưởng đạt được đều chuyển thành Thưởng nhỏ
        if (state.difficulty === 'easy' && isEligible) {
            rewardText = "Thưởng nhỏ";
        }
    }

    if (result === 'win') {
        titleEl.innerText = "Chúc mừng bạn đã chiến thắng!";
        titleEl.style.color = "#4ade80";
    } else if (result === 'lose') {
        titleEl.innerText = "Chúc bạn may mắn lần sau!";
        titleEl.style.color = "#f87171";
    } else {
        titleEl.innerText = "Ván đấu Hòa!";
        titleEl.style.color = "#facc15";
    }

    msgEl.innerHTML = `${reason ? reason + '<br><br>' : ''}` +
        `Điểm ăn quân: <strong>${playerScore}đ</strong><br>` +
        `<div class="reward-notice ${isEligible ? 'eligible' : 'not-eligible'}">${rewardText}</div>`;

    modal.classList.remove('hidden');
}

// --- TÍCH HỢP BOT & STOCKFISH ENGINE ---

function generateFEN() {
    let fen = "";
    for (let r = 0; r < 8; r++) {
        let empty = 0;
        for (let c = 0; c < 8; c++) {
            const p = state.board[r][c];
            if (!p) {
                empty++;
            } else {
                if (empty > 0) { fen += empty; empty = 0; }
                const char = p.type;
                fen += p.color === 'w' ? char.toUpperCase() : char.toLowerCase();
            }
        }
        if (empty > 0) fen += empty;
        if (r < 7) fen += "/";
    }

    fen += ` ${state.turn} `;
    
    let castling = "";
    if (canCastle('w', 'k', state.board)) castling += "K";
    if (canCastle('w', 'q', state.board)) castling += "Q";
    if (canCastle('b', 'k', state.board)) castling += "k";
    if (canCastle('b', 'q', state.board)) castling += "q";
    fen += (castling || "-") + " - 0 " + state.fullMoveNumber;

    return fen;
}

function requestStockfishMove() {
    // Mức độ Dễ (easy) hoặc AntiChess sẽ di chuyển ngẫu nhiên (mức thấp nhất)
    if (state.selectedVariants.includes('antiChess') || state.difficulty === 'easy') {
        fallbackRandomMove();
        return;
    }

    if (!stockfishWorker) {
        fallbackRandomMove();
        return;
    }

    const fen = generateFEN();
    stockfishWorker.postMessage(`position fen ${fen}`);

    let depth = 5;
    if (state.difficulty === 'hard') depth = 12;

    stockfishWorker.postMessage(`go depth ${depth}`);
}

function executeStockfishMove(moveStr) {
    const fromCol = FILES.indexOf(moveStr[0]);
    const fromRow = 8 - parseInt(moveStr[1]);
    const toCol = FILES.indexOf(moveStr[2]);
    const toRow = 8 - parseInt(moveStr[3]);

    const fromSq = { r: fromRow, c: fromCol };
    const toSq = { r: toRow, c: toCol };

    const p = state.board[fromRow][fromCol];
    const target = state.board[toRow][toCol];

    const validMovesOfPiece = getValidMoves(fromRow, fromCol);
    const isValid = validMovesOfPiece.some(m => m.r === toRow && m.c === toCol);

    if (p && isValid) {
        if (p.type === 'k' && Math.abs(toCol - fromCol) > 1 && !state.selectedVariants.includes('antiChess')) {
            const side = toCol > fromCol ? 'k' : 'q';
            executeCastling(state.turn, side);
            recordHistory({ type: 'castle', side });
        } else {
            applyMoveToBoard(fromSq, toSq, state.board);
            recordHistory({ type: 'normal', piece: p, from: fromSq, to: toSq, captured: target });
        }
        endTurn();
    } else {
        fallbackRandomMove();
    }
}

function fallbackRandomMove() {
    const allMoves = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (state.board[r][c] && state.board[r][c].color === state.turn) {
                const moves = getValidMoves(r, c);
                moves.forEach(m => allMoves.push({ from: { r, c }, to: m }));
            }
        }
    }

    if (allMoves.length === 0) return;

    const selectedMove = allMoves[Math.floor(Math.random() * allMoves.length)];

    const p = state.board[selectedMove.from.r][selectedMove.from.c];
    const target = state.board[selectedMove.to.r][selectedMove.to.c];

    if (p.type === 'k' && selectedMove.to.isCastle) {
        executeCastling(state.turn, selectedMove.to.castleSide);
        recordHistory({ type: 'castle', side: selectedMove.to.castleSide });
    } else {
        applyMoveToBoard(selectedMove.from, selectedMove.to, state.board);
        recordHistory({ type: 'normal', piece: p, from: selectedMove.from, to: selectedMove.to, captured: target });
    }
    endTurn();
}
