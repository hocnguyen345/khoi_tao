/* ===== Kamen Rider Admin Portal - Script ===== */

// --- TOUCH / RIPPLE EFFECTS ---
(function initTouchEffects() {
    // Cursor glow that follows mouse
    const glow = document.createElement('div');
    glow.className = 'cursor-glow';
    document.body.appendChild(glow);

    document.addEventListener('mousemove', (e) => {
        glow.style.left = e.clientX + 'px';
        glow.style.top = e.clientY + 'px';
        glow.classList.add('visible');
    });
    document.addEventListener('mouseleave', () => glow.classList.remove('visible'));

    // Touch ripple on click anywhere
    document.addEventListener('click', (e) => {
        const ripple = document.createElement('div');
        ripple.className = 'touch-ripple';
        ripple.style.left = e.clientX + 'px';
        ripple.style.top = e.clientY + 'px';
        document.body.appendChild(ripple);
        setTimeout(() => ripple.remove(), 500);
    });

    // Ripple effect on buttons
    document.querySelectorAll('.henshin-btn, .toggle-visibility').forEach(btn => {
        btn.classList.add('ripple-container');
        btn.addEventListener('click', function(e) {
            const rect = this.getBoundingClientRect();
            const ripple = document.createElement('span');
            ripple.className = 'ripple-effect';
            const size = Math.max(rect.width, rect.height);
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
            ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
            this.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
        });
    });
})();

// --- PARTICLE BACKGROUND ---
(function initParticles() {
    const canvas = document.getElementById('particleCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles = [];
    let w, h;

    function resize() {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    class Particle {
        constructor() { this.reset(); }
        reset() {
            this.x = Math.random() * w;
            this.y = Math.random() * h;
            this.size = Math.random() * 2 + 0.5;
            this.speedX = (Math.random() - 0.5) * 0.5;
            this.speedY = (Math.random() - 0.5) * 0.5;
            this.opacity = Math.random() * 0.5 + 0.1;
            // Kamen Rider colors: magenta or green
            this.color = Math.random() > 0.5
                ? `rgba(194, 24, 91, ${this.opacity})`
                : `rgba(0, 230, 118, ${this.opacity})`;
        }
        update() {
            this.x += this.speedX;
            this.y += this.speedY;
            if (this.x < 0 || this.x > w || this.y < 0 || this.y > h) this.reset();
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
        }
    }

    const count = Math.min(80, Math.floor((w * h) / 15000));
    for (let i = 0; i < count; i++) particles.push(new Particle());

    function connectParticles() {
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 120) {
                    ctx.beginPath();
                    ctx.strokeStyle = `rgba(0, 230, 118, ${0.06 * (1 - dist / 120)})`;
                    ctx.lineWidth = 0.5;
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        }
    }

    function animate() {
        ctx.clearRect(0, 0, w, h);
        particles.forEach(p => { p.update(); p.draw(); });
        connectParticles();
        requestAnimationFrame(animate);
    }
    animate();
})();

// --- CLOCK ---
function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const el1 = document.getElementById('currentTime');
    if (el1) el1.textContent = `${dateStr} — ${timeStr}`;

    const el2 = document.getElementById('dashTime');
    if (el2) el2.textContent = `${dateStr} | ${timeStr}`;
}
updateClock();
setInterval(updateClock, 1000);

// --- LOGIN PAGE LOGIC ---
(function initLogin() {
    const codeInput = document.getElementById('adminCode');
    const henshinBtn = document.getElementById('henshinBtn');
    const statusMsg = document.getElementById('statusMsg');
    const codeWrapper = document.getElementById('codeWrapper');
    const toggleBtn = document.getElementById('toggleVisibility');
    const overlay = document.getElementById('henshinOverlay');

    if (!codeInput || !henshinBtn) return; // Not on login page

    // Toggle password visibility
    toggleBtn.addEventListener('click', () => {
        const isPassword = codeInput.type === 'password';
        codeInput.type = isPassword ? 'text' : 'password';
        toggleBtn.querySelector('svg').style.color = isPassword ? 'var(--green)' : '';
    });

    // Handle login — mã nhập vào = mã phòng
    function attemptLogin() {
        const code = codeInput.value.trim();
        if (!code) {
            statusMsg.textContent = '⚠ VUI LÒNG NHẬP MÃ PHÒNG';
            statusMsg.className = 'status-msg error';
            codeWrapper.classList.add('shake');
            setTimeout(() => codeWrapper.classList.remove('shake'), 500);
            return;
        }

        statusMsg.textContent = '✓ TRUY CẬP PHÒNG THÀNH CÔNG';
        statusMsg.className = 'status-msg success';

        // Lưu mã phòng vào session
        sessionStorage.setItem('kr_authenticated', 'true');
        sessionStorage.setItem('kr_room_code', code.toUpperCase());
        sessionStorage.setItem('kr_login_time', Date.now().toString());

        // Hiệu ứng henshin rồi chuyển trang
        overlay.classList.add('active');
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1800);
    }

    henshinBtn.addEventListener('click', attemptLogin);
    codeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') attemptLogin();
    });

    // Auto focus
    codeInput.focus();
})();

// --- DASHBOARD PAGE LOGIC ---
(function initDashboard() {
    const logoutBtn = document.getElementById('logoutBtn');
    const isDashboard = document.body.classList.contains('dashboard-body');

    if (!isDashboard) return;

    // Check auth
    if (sessionStorage.getItem('kr_authenticated') !== 'true') {
        window.location.href = 'index.html';
        return;
    }

    // Logout
    logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('kr_authenticated');
        sessionStorage.removeItem('kr_login_time');
        window.location.href = 'index.html';
    });

    // Animate stat counters
    document.querySelectorAll('.stat-value').forEach(el => {
        const target = parseInt(el.dataset.target) || 0;
        const duration = 1500;
        const start = performance.now();

        function tick(now) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.floor(target * eased).toLocaleString();
            if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    });
})();
