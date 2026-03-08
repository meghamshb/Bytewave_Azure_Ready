/**
 * PhysiMate Interactive Physics Simulator
 * Uses Matter.js for rigid-body physics.
 * Force arrows and live equations are drawn on a 2-D canvas overlay.
 *
 * Physics units are kept proportional to real SI:
 *   - Matter.js gravity: y=1, scale=0.001 (default)
 *   - Applied force.x  = F_Newton * GS / G   where GS=0.001, G=9.8
 *   - Velocities are converted via V_CAL so arcs/speeds match real physics proportions.
 */

const SIM = Object.freeze({
    W: 780, H: 420,          // canvas size (px)
    SCALE: 80,               // px per metre (visual scale)
    G: 9.8,                  // real gravity m/s²
    GS: 0.001,               // Matter.js gravity.scale default
    // V_CAL converts m/s → px/step so velocity arcs match the engine gravity.
    // Derived from: g_sim = GS*(dt_ms)² and v_px = v_mps * sqrt(g_sim * SCALE / G)
    V_CAL: Math.sqrt(0.001 * (1000 / 60) * (1000 / 60) * 80 / 9.8), // ≈ 1.507
});

// One global registry so script.js can access simulators by panel-id
window._simulators = window._simulators || {};

class PhysicsSimulator {
    constructor(containerId, scene) {
        this.containerId = containerId;
        this.scene = scene;

        // Merge all params into one flat dict
        this.params = {};
        Object.assign(this.params, scene.physics.initialParams || {});
        (scene.params || []).forEach(p => { this.params[p.id] = p.value; });

        this.engine = null;
        this.render = null;
        this.runner = null;
        this.bodies = {};
        this.overlayCtx = null;
        this.running = false;
        this.sceneType = scene.physics.scenario;
        this.tracePoints = [];
        this._resetScheduled = false;

        // Measured body dimensions set during buildScene
        this.bw = SIM.SCALE * 1.6;
        this.bh = SIM.SCALE * 0.75;

        this._init();
    }

    // ─── Initialization ────────────────────────────────────────────────────────

    _init() {
        const container = document.getElementById(this.containerId);
        if (!container) return;
        container.innerHTML = '';
        container.style.position = 'relative';

        // Main Matter.js canvas
        const canvas = document.createElement('canvas');
        canvas.width = SIM.W; canvas.height = SIM.H;
        canvas.style.cssText = 'width:100%;border-radius:8px;display:block;';
        container.appendChild(canvas);

        // Transparent overlay for arrows / labels / equations
        const overlay = document.createElement('canvas');
        overlay.width = SIM.W; overlay.height = SIM.H;
        overlay.style.cssText =
            'position:absolute;top:0;left:0;width:100%;height:100%;' +
            'pointer-events:none;border-radius:8px;';
        container.appendChild(overlay);
        this.overlayCtx = overlay.getContext('2d');

        const { Engine, Render, Runner, Events } = Matter;

        this.engine = Engine.create({
            gravity: { x: 0, y: 1, scale: SIM.GS },
        });

        this.render = Render.create({
            canvas,
            engine: this.engine,
            options: {
                width: SIM.W, height: SIM.H,
                wireframes: false,
                background: '#0d0f18',
            },
        });

        this._buildScene();

        Events.on(this.engine, 'beforeUpdate', () => this._applyForces());
        Events.on(this.render, 'afterRender',  () => this._drawOverlay());

        Render.run(this.render);
        this.runner = Runner.create();
        Runner.run(this.runner, this.engine);
        this.running = true;
    }

    // ─── Scene builders ────────────────────────────────────────────────────────

    _buildScene() {
        Matter.Composite.clear(this.engine.world, false);
        this.bodies = {};
        this.tracePoints = [];
        this._resetScheduled = false;

        const cx = SIM.W / 2;
        const groundY = SIM.H * 0.80;
        this.cx = cx;
        this.groundY = groundY;

        const builders = {
            force:      () => this._buildForce(cx, groundY),
            collision:  () => this._buildCollision(cx, groundY),
            pendulum:   () => this._buildPendulum(cx, groundY),
            projectile: () => this._buildProjectile(cx, groundY),
            spring:     () => this._buildSpring(cx, groundY),
            incline:    () => this._buildIncline(cx, groundY),
            freefall:   () => this._buildFreefall(cx, groundY),
            pulley:     () => this._buildPulley(cx, groundY),
            circular:   () => this._buildCircular(cx, groundY),
        };
        (builders[this.sceneType] || (() => {}))();
    }

    _ground(cx, groundY) {
        return Matter.Bodies.rectangle(cx, groundY + 10, SIM.W * 2, 20, {
            isStatic: true, label: 'ground',
            render: { fillStyle: '#252840' },
        });
    }

    _buildForce(cx, groundY) {
        const S = SIM.SCALE, p = this.params;
        this.bw = S * 1.6; this.bh = S * 0.75;

        const ground = this._ground(cx, groundY);
        const block = Matter.Bodies.rectangle(
            cx - S * 2.5, groundY - this.bh / 2,
            this.bw, this.bh,
            { label: 'block', friction: 0, frictionAir: 0, restitution: 0,
              render: { fillStyle: '#2563eb' } }
        );
        Matter.Body.setMass(block, p.mass || 2);
        Matter.Composite.add(this.engine.world, [ground, block]);
        this.bodies.block = block;
    }

    _buildCollision(cx, groundY) {
        const S = SIM.SCALE, p = this.params;
        const r1 = Math.max(18, Math.min(34, 20 + (p.m1 || 1) * 4));
        const r2 = Math.max(18, Math.min(34, 20 + (p.m2 || 1.5) * 4));
        const e = p.restitution !== undefined ? p.restitution : 1;

        const ground = this._ground(cx, groundY);
        const ball1 = Matter.Bodies.circle(cx - S * 3, groundY - r1, r1, {
            label: 'ball1', friction: 0, frictionAir: 0.003,
            restitution: e, render: { fillStyle: '#2563eb' },
        });
        Matter.Body.setMass(ball1, p.m1 || 1);
        Matter.Body.setVelocity(ball1, { x: (p.v1 || 3) * SIM.V_CAL, y: 0 });

        const ball2 = Matter.Bodies.circle(cx + S * 0.8, groundY - r2, r2, {
            label: 'ball2', friction: 0, frictionAir: 0.003,
            restitution: e, render: { fillStyle: '#dc2626' },
        });
        Matter.Body.setMass(ball2, p.m2 || 1.5);
        Matter.Body.setVelocity(ball2, { x: (p.v2 || 0) * SIM.V_CAL, y: 0 });

        Matter.Composite.add(this.engine.world, [ground, ball1, ball2]);
        this.bodies.ball1 = ball1;
        this.bodies.ball2 = ball2;
        this.r1 = r1; this.r2 = r2;
    }

    _buildPendulum(cx, groundY) {
        const S = SIM.SCALE, p = this.params;
        const L = Math.min((p.L || 2.5) * S * 0.85, SIM.H * 0.56);
        const theta0 = ((p.theta0 || 40) * Math.PI) / 180;
        const pivotY = groundY - SIM.H * 0.74;

        const ceiling = Matter.Bodies.rectangle(cx, pivotY - 12, SIM.W, 10, {
            isStatic: true, render: { fillStyle: '#252840' },
        });
        const pivot = Matter.Bodies.circle(cx, pivotY, 7, {
            isStatic: true, label: 'pivot', render: { fillStyle: '#94a3b8' },
        });
        const bobX = cx + L * Math.sin(theta0);
        const bobY = pivotY + L * Math.cos(theta0);
        const bob = Matter.Bodies.circle(bobX, bobY, 22, {
            label: 'bob', friction: 0, frictionAir: 0.003, restitution: 0.3,
            render: { fillStyle: '#f59e0b' },
        });
        Matter.Body.setMass(bob, p.mass || 1);

        const rod = Matter.Constraint.create({
            pointA: { x: cx, y: pivotY },
            bodyB: bob, length: L, stiffness: 1,
            render: { strokeStyle: '#6b7280', lineWidth: 2 },
        });

        Matter.Composite.add(this.engine.world, [ceiling, pivot, bob, rod]);
        this.bodies.bob = bob;
        this.pivotPos = { x: cx, y: pivotY };
        this.pendulumL = L;
    }

    _buildProjectile(cx, groundY) {
        const S = SIM.SCALE, p = this.params;
        const theta = ((p.theta0 || 45) * Math.PI) / 180;
        const v0 = p.v0 || 10;
        const startX = cx - S * 3.5;

        const ground = this._ground(cx, groundY);
        const ball = Matter.Bodies.circle(startX, groundY - 13, 12, {
            label: 'ball', friction: 0, frictionAir: 0, restitution: 0,
            render: { fillStyle: '#10b981' },
        });
        // V_CAL converts m/s → px/step, calibrated against engine gravity so
        // the arc height and range match real physics proportions.
        Matter.Body.setVelocity(ball, {
            x: Math.cos(theta) * v0 * SIM.V_CAL,
            y: -Math.sin(theta) * v0 * SIM.V_CAL,
        });

        Matter.Composite.add(this.engine.world, [ground, ball]);
        this.bodies.ball = ball;
        this.launchX = startX; this.launchY = groundY - 13;
        this.tracePoints = [];
    }

    _buildSpring(cx, groundY) {
        const S = SIM.SCALE, p = this.params;
        const x0  = (p.x0 || 1.5) * S;
        const stif = Math.min(0.6, Math.max(0.02, (p.k || 5) / 60));

        const wall = Matter.Bodies.rectangle(cx - S * 0.5, groundY - S * 0.4, 14, S * 0.8, {
            isStatic: true, label: 'wall', render: { fillStyle: '#4b5563' },
        });
        const bw = S, bh = S * 0.6;
        const block = Matter.Bodies.rectangle(
            cx + x0, groundY - bh / 2,
            bw, bh,
            { label: 'block', friction: 0, frictionAir: 0.01, restitution: 0,
              render: { fillStyle: '#7c3aed' } }
        );
        Matter.Body.setMass(block, p.mass || 2);

        const spring = Matter.Constraint.create({
            pointA: { x: cx, y: groundY - S * 0.4 },
            bodyB: block, pointB: { x: -bw / 2, y: 0 },
            length: 0, stiffness: stif,
            render: { strokeStyle: '#f59e0b', lineWidth: 2.5, type: 'spring' },
        });

        const ground = this._ground(cx, groundY);
        Matter.Composite.add(this.engine.world, [wall, block, spring, ground]);
        this.bodies.block = block;
        this.springAnchorX = cx;
        this.bw = bw; this.bh = bh;
    }

    _buildIncline(cx, groundY) {
        const S = SIM.SCALE, p = this.params;
        const angle = ((p.angle || 30) * Math.PI) / 180;
        const iLen = SIM.W * 0.58;
        const iH   = iLen * Math.tan(angle);
        const rampX = cx - iLen * 0.25;
        const rampY = groundY - iH * 0.5;

        const incline = Matter.Bodies.rectangle(rampX, rampY, iLen, 14, {
            isStatic: true, angle, label: 'incline',
            render: { fillStyle: '#334155' },
        });
        const bw = S * 1.1, bh = S * 0.55;
        const block = Matter.Bodies.rectangle(
            rampX - iLen * 0.15, rampY - bh * 0.8,
            bw, bh,
            { label: 'block', friction: p.friction || 0.2, frictionAir: 0,
              restitution: 0, angle,
              render: { fillStyle: '#2563eb' } }
        );
        Matter.Body.setMass(block, p.mass || 2);

        // Full-width floor so the block lands after sliding off the ramp
        const floor = Matter.Bodies.rectangle(cx, groundY + 10, SIM.W * 2, 20, {
            isStatic: true, render: { fillStyle: '#252840' },
        });
        // Left wall keeps the block inside the visible canvas area
        const leftWall = Matter.Bodies.rectangle(-15, SIM.H / 2, 30, SIM.H * 2, {
            isStatic: true, render: { fillStyle: '#252840' },
        });

        Matter.Composite.add(this.engine.world, [incline, block, floor, leftWall]);
        this.bodies.block = block;
        this.bodies.incline = incline;
        this.inclineAngle = angle;
        this.bw = bw; this.bh = bh;
    }

    _buildFreefall(cx, groundY) {
        const p = this.params;
        const ball = Matter.Bodies.circle(cx, groundY - SIM.H * 0.55, 26, {
            label: 'ball', friction: 0, frictionAir: p.drag || 0,
            restitution: 0.55, render: { fillStyle: '#10b981' },
        });
        Matter.Body.setMass(ball, p.mass || 1);
        const ground = this._ground(cx, groundY);
        Matter.Composite.add(this.engine.world, [ball, ground]);
        this.bodies.ball = ball;
    }

    _buildPulley(cx, groundY) {
        const S = SIM.SCALE, p = this.params;
        const m1 = p.m1 || 10;
        const m2 = p.m2 || 5;
        const pulleyY = groundY - SIM.H * 0.70;
        const offset  = S * 1.4;

        const r1 = Math.max(18, Math.min(36, 13 + m1 * 1.5));
        const r2 = Math.max(14, Math.min(32,  9 + m2 * 1.5));

        // Ceiling bar
        const ceiling = Matter.Bodies.rectangle(cx, pulleyY - 16, SIM.W, 20, {
            isStatic: true, render: { fillStyle: '#252840' },
        });
        // Pulley wheel (static, visual only)
        const pulley = Matter.Bodies.circle(cx, pulleyY, 16, {
            isStatic: true, label: 'pulley',
            render: { fillStyle: '#94a3b8' },
        });

        const startY = pulleyY + S * 1.5;

        // Mass 1 (left, starts higher if heavier so it falls)
        const ball1 = Matter.Bodies.circle(cx - offset, startY, r1, {
            label: 'ball1', friction: 0, frictionAir: 0.015, restitution: 0,
            render: { fillStyle: '#2563eb' },
        });
        Matter.Body.setMass(ball1, m1);

        // Mass 2 (right)
        const ball2 = Matter.Bodies.circle(cx + offset, startY, r2, {
            label: 'ball2', friction: 0, frictionAir: 0.015, restitution: 0,
            render: { fillStyle: '#dc2626' },
        });
        Matter.Body.setMass(ball2, m2);

        // Rope constraints — very low stiffness so they are visual only;
        // physics is handled by our custom force application
        const rope1 = Matter.Constraint.create({
            pointA: { x: cx, y: pulleyY },
            bodyB: ball1, pointB: { x: 0, y: -r1 },
            length: startY - pulleyY - r1,
            stiffness: 0.0001,
            render: { strokeStyle: '#64748b', lineWidth: 2.5 },
        });
        const rope2 = Matter.Constraint.create({
            pointA: { x: cx, y: pulleyY },
            bodyB: ball2, pointB: { x: 0, y: -r2 },
            length: startY - pulleyY - r2,
            stiffness: 0.0001,
            render: { strokeStyle: '#64748b', lineWidth: 2.5 },
        });

        Matter.Composite.add(this.engine.world, [ceiling, pulley, ball1, ball2, rope1, rope2]);
        this.bodies.ball1 = ball1;
        this.bodies.ball2 = ball2;
        this.pulleyPos    = { x: cx, y: pulleyY };
        this.pulleyOffset = offset;
        this.r1 = r1; this.r2 = r2;
    }

    _buildCircular(cx, groundY) {
        const S = SIM.SCALE, p = this.params;
        // r in metres → scale to pixels, capped to fit canvas
        const r  = Math.min((p.r || 1.5) * S * 0.72, SIM.H * 0.33);
        const m  = p.mass || 1;
        const v0 = p.v0  || 4;

        const pivotX = cx;
        const pivotY = groundY - SIM.H * 0.42;

        const pivot = Matter.Bodies.circle(pivotX, pivotY, 8, {
            isStatic: true, label: 'pivot',
            render: { fillStyle: '#94a3b8' },
        });
        const ball = Matter.Bodies.circle(pivotX + r, pivotY, 18, {
            label: 'ball', friction: 0, frictionAir: 0, restitution: 0,
            render: { fillStyle: '#10b981' },
        });
        Matter.Body.setMass(ball, m);
        // Initial tangential (perpendicular) velocity so ball orbits clockwise
        Matter.Body.setVelocity(ball, { x: 0, y: v0 * SIM.V_CAL });

        // Rigid rod constraint → provides centripetal force, keeps radius fixed
        const rod = Matter.Constraint.create({
            pointA: { x: pivotX, y: pivotY },
            bodyB:  ball,
            length: r,
            stiffness: 1,
            render: { strokeStyle: '#64748b', lineWidth: 2 },
        });

        Matter.Composite.add(this.engine.world, [pivot, ball, rod]);
        this.bodies.ball   = ball;
        this.pivotPos      = { x: pivotX, y: pivotY };
        this.circleR       = r;
    }

    // ─── Per-frame force application ───────────────────────────────────────────

    _applyForces() {
        const p = this.params;
        const G = SIM.G;

        switch (this.sceneType) {

            case 'force': {
                const block = this.bodies.block;
                if (!block || block.isStatic) break;

                // Tolerance of 16 px accounts for slight contact sinking in the solver
                const onGround = Math.abs(block.position.y - (this.groundY - this.bh / 2)) < 16;
                if (!onGround) break;

                const mass = p.mass || 2;
                const F    = p.force || 0;
                const mu   = p.friction || 0;
                const vx   = block.velocity.x;

                // Friction opposes motion; static friction balances if F < μmg
                let F_fric;
                const staticMax = mu * mass * G;
                if (Math.abs(vx) > 0.015) {
                    F_fric = -Math.sign(vx) * staticMax;
                } else if (Math.abs(F) > staticMax) {
                    F_fric = -Math.sign(F) * staticMax;
                } else {
                    F_fric = -F; // full static friction
                }

                // Convert to Matter.js force units: F_mjs = F_Newton * GS / G
                Matter.Body.applyForce(block, block.position, {
                    x: (F + F_fric) * SIM.GS / G,
                    y: 0,
                });

                // Auto-reset when block leaves the canvas
                if (!this._resetScheduled &&
                    (block.position.x > SIM.W + 80 || block.position.x < -80)) {
                    this._resetScheduled = true;
                    setTimeout(() => this._buildScene(), 400);
                }
                break;
            }

            case 'projectile': {
                const ball = this.bodies.ball;
                if (!ball) break;
                this.tracePoints.push({ x: ball.position.x, y: ball.position.y });
                if (this.tracePoints.length > 500) this.tracePoints.shift();

                if (!this._resetScheduled &&
                    (ball.position.x > SIM.W + 80 || ball.position.y > SIM.H + 40)) {
                    this._resetScheduled = true;
                    setTimeout(() => this._buildScene(), 900);
                }
                break;
            }

            case 'collision': {
                const { ball1, ball2 } = this.bodies;
                if (!ball1 || !ball2) break;
                // Auto-reset when both balls have cleared the screen (either side)
                if (!this._resetScheduled &&
                    ((ball1.position.x > SIM.W + 100 && ball2.position.x > SIM.W + 100) ||
                     (ball1.position.x < -100 && ball2.position.x < -100))) {
                    this._resetScheduled = true;
                    setTimeout(() => this._buildScene(), 1200);
                }
                break;
            }

            case 'incline': {
                const block = this.bodies.block;
                if (!block) break;
                // Block slides off the ramp — auto-reset when it exits the canvas
                if (!this._resetScheduled &&
                    (block.position.y > SIM.H + 40 ||
                     block.position.x < -80 ||
                     block.position.x > SIM.W + 80)) {
                    this._resetScheduled = true;
                    setTimeout(() => this._buildScene(), 1000);
                }
                break;
            }

            case 'freefall': {
                const ball = this.bodies.ball;
                if (!ball) break;
                // Auto-reset once the ball has settled on the ground
                if (!this._resetScheduled) {
                    const nearGround = ball.position.y >= this.groundY - 40;
                    const settled = Math.abs(ball.velocity.y) < 0.3 && Math.abs(ball.velocity.x) < 0.3;
                    if (nearGround && settled) {
                        this._resetScheduled = true;
                        setTimeout(() => this._buildScene(), 1500);
                    }
                }
                break;
            }

            case 'circular': {
                const ball = this.bodies.ball;
                if (!ball) break;
                const m = this.params.mass || 1;
                // Cancel engine gravity so ball moves in a true horizontal-plane circle.
                // The rigid-rod constraint then provides all centripetal force.
                Matter.Body.applyForce(ball, ball.position, { x: 0, y: -m * SIM.GS });
                break;
            }

            case 'pulley': {
                const { ball1, ball2 } = this.bodies;
                if (!ball1 || !ball2 || !this.pulleyPos) break;

                const m1  = this.params.m1 || 10;
                const m2  = this.params.m2 || 5;
                const px  = this.pulleyPos.x;
                const off = this.pulleyOffset;

                // Lock x positions — Atwood machine moves vertically only
                Matter.Body.setPosition(ball1, { x: px - off, y: ball1.position.y });
                Matter.Body.setPosition(ball2, { x: px + off, y: ball2.position.y });
                Matter.Body.setVelocity(ball1,  { x: 0, y: ball1.velocity.y });
                Matter.Body.setVelocity(ball2,  { x: 0, y: ball2.velocity.y });

                // Atwood tension: T = 2·m1·m2·g / (m1+m2)
                // In Matter.js force units: F_mjs = F_Newton · SIM.GS / SIM.G
                // Since SIM.G cancels: T_mjs = 2·m1·m2·SIM.GS / (m1+m2)
                const T_mjs = 2 * m1 * m2 * SIM.GS / (m1 + m2);
                Matter.Body.applyForce(ball1, ball1.position, { x: 0, y: -T_mjs });
                Matter.Body.applyForce(ball2, ball2.position, { x: 0, y: -T_mjs });

                // Enforce inextensible rope: v1 + v2 = 0  →  each gets (v1−v2)/2
                const vHalf = (ball1.velocity.y - ball2.velocity.y) / 2;
                Matter.Body.setVelocity(ball1, { x: 0, y:  vHalf });
                Matter.Body.setVelocity(ball2, { x: 0, y: -vHalf });

                // Auto-reset when a mass hits the floor or gets within 40px of pulley
                const minY = this.pulleyPos.y + 40;
                if (!this._resetScheduled &&
                    (ball1.position.y > this.groundY - 30 || ball2.position.y > this.groundY - 30 ||
                     ball1.position.y < minY || ball2.position.y < minY)) {
                    this._resetScheduled = true;
                    setTimeout(() => this._buildScene(), 1200);
                }
                break;
            }
        }
    }

    // ─── Overlay drawing ───────────────────────────────────────────────────────

    _drawOverlay() {
        const ctx = this.overlayCtx;
        ctx.clearRect(0, 0, SIM.W, SIM.H);

        const draw = {
            force:      () => this._ovlForce(ctx),
            collision:  () => this._ovlCollision(ctx),
            pendulum:   () => this._ovlPendulum(ctx),
            projectile: () => this._ovlProjectile(ctx),
            spring:     () => this._ovlSpring(ctx),
            incline:    () => this._ovlIncline(ctx),
            freefall:   () => this._ovlFreefall(ctx),
            pulley:     () => this._ovlPulley(ctx),
            circular:   () => this._ovlCircular(ctx),
        };
        (draw[this.sceneType] || (() => {}))();
        this._drawEquationBar(ctx);
    }

    /** Draw an arrow with an arrowhead and an optional label. */
    _arrow(ctx, x1, y1, x2, y2, color, label, lx, ly) {
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        if (len < 8) return;
        const ang = Math.atan2(dy, dx);
        const hw = 6, hl = 11;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle   = color;
        ctx.lineWidth   = 2.5;
        ctx.lineCap     = 'round';

        // Shaft
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2 - Math.cos(ang) * hl, y2 - Math.sin(ang) * hl);
        ctx.stroke();

        // Arrowhead
        ctx.translate(x2, y2);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-hl, -hw / 2);
        ctx.lineTo(-hl,  hw / 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        if (label) {
            ctx.save();
            ctx.font         = 'bold 11.5px Inter, sans-serif';
            ctx.fillStyle    = color;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor  = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur   = 4;
            ctx.fillText(label,
                lx !== undefined ? lx : (x1 + x2) / 2 + 14,
                ly !== undefined ? ly : (y1 + y2) / 2);
            ctx.restore();
        }
    }

    /** Draw mass label inside body. */
    _bodyLabel(ctx, x, y, text) {
        ctx.save();
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 3;
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    _ovlForce(ctx) {
        const block = this.bodies.block;
        if (!block) return;
        const { x, y } = block.position;
        const bw = this.bw, bh = this.bh;
        const p = this.params;
        const F = p.force || 0, mu = p.friction || 0, mass = p.mass || 2;

        this._bodyLabel(ctx, x, y, `m=${mass} kg`);

        // Applied force →
        if (F > 0) {
            this._arrow(ctx, x + bw/2, y, x + bw/2 + 60, y, '#fbbf24', `F=${F}N`, x + bw/2 + 78, y - 13);
        }
        // Normal force ↑
        this._arrow(ctx, x, y - bh/2, x, y - bh/2 - 52, '#34d399', 'N', x + 18, y - bh/2 - 58);
        // Weight ↓
        this._arrow(ctx, x, y + bh/2, x, y + bh/2 + 52, '#f87171', 'mg', x + 22, y + bh/2 + 64);
        // Friction ← (only if mu > 0)
        if (mu > 0) {
            const vx = block.velocity.x;
            const fDir = vx > 0.02 ? -1 : (F > 0 ? -1 : 1);
            this._arrow(ctx, x - bw/2, y, x - bw/2 + fDir * 48, y, '#fb923c', `f=μmg`, x - bw/2 + fDir * 66, y - 13);
        }
    }

    _ovlCollision(ctx) {
        const { ball1, ball2 } = this.bodies;
        if (!ball1 || !ball2) return;
        const p = this.params;

        const drawBall = (ball, r, sub, color, mass) => {
            const { x, y } = ball.position;
            const vx = ball.velocity.x;
            if (Math.abs(vx) > 0.02) {
                const d = vx > 0 ? 1 : -1;
                this._arrow(ctx, x, y - r - 8, x + d * 55, y - r - 8, color,
                    `v${sub}`, x + d * 72, y - r - 8);
            }
            this._bodyLabel(ctx, x, y, `m=${mass}`);
        };

        drawBall(ball1, this.r1 || 20, '₁', '#93c5fd', p.m1 || 1);
        drawBall(ball2, this.r2 || 20, '₂', '#fca5a5', p.m2 || 1.5);
    }

    _ovlPendulum(ctx) {
        const { bob } = this.bodies;
        if (!bob || !this.pivotPos) return;
        const { x, y } = bob.position;
        const { x: px, y: py } = this.pivotPos;

        // Gravity ↓
        this._arrow(ctx, x, y + 22, x, y + 68, '#f87171', 'mg', x + 22, y + 74);

        // Tension → pivot
        const dx = px - x, dy = py - y;
        const len = Math.hypot(dx, dy);
        if (len > 0) {
            const tx = x + (dx / len) * 52, ty = y + (dy / len) * 52;
            this._arrow(ctx, x, y, tx, ty, '#34d399', 'T', tx - 14, ty - 10);
        }

        // Angle arc + label
        const theta = Math.atan2(x - px, y - py);
        ctx.save();
        ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + 60); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 11.5px Inter, sans-serif';
        ctx.fillText(`θ=${Math.abs((theta * 180 / Math.PI).toFixed(0))}°`, px + 30, py + 54);
        ctx.restore();
    }

    _ovlProjectile(ctx) {
        // Dashed trace
        if (this.tracePoints.length > 1) {
            ctx.save();
            ctx.strokeStyle = 'rgba(16,185,129,0.40)';
            ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(this.tracePoints[0].x, this.tracePoints[0].y);
            this.tracePoints.forEach(pt => ctx.lineTo(pt.x, pt.y));
            ctx.stroke(); ctx.setLineDash([]); ctx.restore();
        }
        const ball = this.bodies.ball;
        if (!ball) return;
        const { x, y } = ball.position;
        const vx = ball.velocity.x, vy = ball.velocity.y, sc = 5;
        if (Math.abs(vx) > 0.1)
            this._arrow(ctx, x, y, x + vx*sc, y, '#34d399', 'vₓ', x + vx*sc/2, y - 13);
        if (Math.abs(vy) > 0.1)
            this._arrow(ctx, x, y, x, y + vy*sc, '#3b82f6', 'vᵧ', x + 18, y + vy*sc/2);
    }

    _ovlSpring(ctx) {
        const block = this.bodies.block;
        if (!block) return;
        const dx = block.position.x - this.springAnchorX;
        const k  = this.params.k || 5;
        const Fs = -(k * dx / SIM.SCALE).toFixed(1);
        if (Math.abs(dx) > 6) {
            const d = dx > 0 ? -1 : 1;
            this._arrow(ctx,
                block.position.x, block.position.y,
                block.position.x + d * 55, block.position.y,
                '#f59e0b', `F=−kx=${Fs}N`,
                block.position.x + d * 75, block.position.y - 13);
        }
        this._bodyLabel(ctx, block.position.x, block.position.y, `m=${this.params.mass||2}kg`);
    }

    _ovlIncline(ctx) {
        const block = this.bodies.block;
        if (!block) return;
        const { x, y } = block.position;
        const ang = this.inclineAngle || 0;
        const cosC = Math.cos(ang), sinC = Math.sin(ang);

        // Weight ↓
        this._arrow(ctx, x, y + 30, x, y + 78, '#f87171', 'mg', x + 22, y + 86);
        // Component along slope
        const d = -1;
        this._arrow(ctx, x, y, x + d*48*cosC, y + d*48*sinC*(-1), '#fbbf24', 'mg sinθ',
            x + d*66*cosC, y - 14);
    }

    _ovlFreefall(ctx) {
        const ball = this.bodies.ball;
        if (!ball) return;
        const { x, y } = ball.position;
        this._arrow(ctx, x, y + 26, x, y + 76, '#f87171', 'mg', x + 22, y + 84);
        const vy = ball.velocity.y;
        if (Math.abs(vy) > 0.1)
            this._arrow(ctx, x + 36, y, x + 36, y + vy*6, '#34d399', 'v', x + 52, y + vy*3);
    }

    _ovlPulley(ctx) {
        const { ball1, ball2 } = this.bodies;
        if (!ball1 || !ball2 || !this.pulleyPos) return;
        const p  = this.params;
        const m1 = p.m1 || 10, m2 = p.m2 || 5;
        const r1 = this.r1 || 20, r2 = this.r2 || 16;
        const { x: px, y: py } = this.pulleyPos;
        const PULLEY_R = 16;

        // Draw rope: ball1 top → pulley left side → arc → pulley right side → ball2 top
        ctx.save();
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(ball1.position.x, ball1.position.y - r1);
        ctx.lineTo(px - PULLEY_R, py);
        ctx.arc(px, py, PULLEY_R, Math.PI, 0, false);
        ctx.lineTo(ball2.position.x, ball2.position.y - r2);
        ctx.stroke();
        ctx.restore();

        // Mass labels
        this._bodyLabel(ctx, ball1.position.x, ball1.position.y, `m₁=${m1}kg`);
        this._bodyLabel(ctx, ball2.position.x, ball2.position.y, `m₂=${m2}kg`);

        // Weight arrows (downward)
        this._arrow(ctx,
            ball1.position.x, ball1.position.y + r1,
            ball1.position.x, ball1.position.y + r1 + 48,
            '#f87171', 'm₁g', ball1.position.x + 30, ball1.position.y + r1 + 56);
        this._arrow(ctx,
            ball2.position.x, ball2.position.y + r2,
            ball2.position.x, ball2.position.y + r2 + 48,
            '#f87171', 'm₂g', ball2.position.x + 30, ball2.position.y + r2 + 56);

        // Tension arrows (upward)
        this._arrow(ctx,
            ball1.position.x, ball1.position.y - r1,
            ball1.position.x, ball1.position.y - r1 - 48,
            '#34d399', 'T', ball1.position.x + 14, ball1.position.y - r1 - 54);
        this._arrow(ctx,
            ball2.position.x, ball2.position.y - r2,
            ball2.position.x, ball2.position.y - r2 - 48,
            '#34d399', 'T', ball2.position.x + 14, ball2.position.y - r2 - 54);

        // Velocity arrow on the descending mass
        const vy1 = ball1.velocity.y;
        if (Math.abs(vy1) > 0.08) {
            const d = vy1 > 0 ? 1 : -1;
            const ax = ball1.position.x + r1 + 12;
            this._arrow(ctx, ax, ball1.position.y, ax, ball1.position.y + d * 44,
                '#fbbf24', 'v', ax + 14, ball1.position.y + d * 22);
        }

        // Pulley axle dot
        ctx.save();
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    _ovlCircular(ctx) {
        const ball = this.bodies.ball;
        if (!ball || !this.pivotPos) return;
        const { x, y } = ball.position;
        const { x: px, y: py } = this.pivotPos;
        const p    = this.params;
        const m    = p.mass || 1;
        const v0   = p.v0   || 4;
        const r_m  = p.r    || 1.5;

        // Dashed orbit circle
        ctx.save();
        ctx.strokeStyle = 'rgba(16,185,129,0.22)';
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.arc(px, py, this.circleR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Radius line (pivot → ball)
        ctx.save();
        ctx.strokeStyle = 'rgba(100,116,139,0.55)';
        ctx.lineWidth   = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Centripetal-force arrow (ball → pivot)
        const dx = px - x, dy = py - y;
        const len = Math.hypot(dx, dy);
        if (len > 0) {
            const tx = x + (dx / len) * 56, ty = y + (dy / len) * 56;
            this._arrow(ctx, x, y, tx, ty, '#f87171', 'Fₒ', tx + 10, ty - 12);
        }

        // Velocity arrow (tangential)
        const vx = ball.velocity.x, vy = ball.velocity.y;
        const sc = 5;
        if (Math.hypot(vx, vy) > 0.08) {
            this._arrow(ctx, x, y, x + vx * sc, y + vy * sc,
                '#34d399', 'v', x + vx * sc / 2 + 14, y + vy * sc / 2 - 10);
        }

        // Pivot dot label
        ctx.save();
        ctx.font      = 'bold 11px Inter, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center';
        ctx.fillText('pivot', px, py - 14);
        ctx.restore();

        // Mass label on ball
        this._bodyLabel(ctx, x, y, `m=${m}kg`);
    }

    // ─── Live equation bar at bottom of canvas ──────────────────────────────

    _drawEquationBar(ctx) {
        const p = this.params, G = SIM.G;
        let eq = '';

        switch (this.sceneType) {
            case 'force': {
                const F = p.force||0, mu = p.friction||0, mass = p.mass||2;
                const a = ((F - mu*mass*G) / mass).toFixed(2);
                eq = `a = (${F} − ${(mu*mass*G).toFixed(1)}) / ${mass} = ${a} m/s²`;
                break;
            }
            case 'pendulum': {
                const L = p.L||2.5;
                const T = (2*Math.PI*Math.sqrt(L/G)).toFixed(2);
                eq = `T = 2π√(L/g) = 2π√(${L}/${G}) = ${T} s`;
                break;
            }
            case 'spring': {
                const k = p.k||5, m = p.mass||2;
                const om = Math.sqrt(k/m).toFixed(2);
                const T  = (2*Math.PI/om).toFixed(2);
                eq = `T = 2π√(m/k) = ${T} s   ω = ${om} rad/s`;
                break;
            }
            case 'collision': {
                const m1=p.m1||1, m2=p.m2||1.5, v1=p.v1||3, e=p.restitution!=null?p.restitution:1;
                const d = m1+m2;
                const v1f=(((m1-e*m2)*v1)/d).toFixed(2);
                const v2f=(((1+e)*m1*v1)/d).toFixed(2);
                eq = `v₁ᶠ=${v1f}  v₂ᶠ=${v2f} m/s   e=${e}`;
                break;
            }
            case 'projectile': {
                const v0=p.v0||10, th=(p.theta0||45)*Math.PI/180;
                const R=(v0*v0*Math.sin(2*th)/G).toFixed(1);
                const H=(v0*v0*Math.sin(th)**2/(2*G)).toFixed(1);
                eq = `Range=${R}m   H_max=${H}m`;
                break;
            }
            case 'incline': {
                const ang=(p.angle||30)*Math.PI/180, mu=p.friction||0.2;
                const a=(G*(Math.sin(ang)-mu*Math.cos(ang))).toFixed(2);
                eq = `a = g(sinθ − μcosθ) = ${a} m/s²`;
                break;
            }
            case 'freefall':
                eq = `a = g = ${G} m/s²  (free fall)`;
                break;
            case 'pulley': {
                const m1 = p.m1 || 10, m2 = p.m2 || 5;
                const a  = (G * (m1 - m2) / (m1 + m2)).toFixed(2);
                const T  = (2 * m1 * m2 * G / (m1 + m2)).toFixed(1);
                eq = `a = (m₁−m₂)g/(m₁+m₂) = ${a} m/s²   T = ${T} N`;
                break;
            }
            case 'circular': {
                const r   = p.r    || 1.5;
                const v0  = p.v0   || 4;
                const m   = p.mass || 1;
                const ac  = (v0 * v0 / r).toFixed(2);
                const Fc  = (m * v0 * v0 / r).toFixed(1);
                const Tpr = v0 > 0 ? (2 * Math.PI * r / v0).toFixed(2) : '∞';
                const om  = v0 > 0 ? (v0 / r).toFixed(2) : '0';
                eq = `aₒ = v²/r = ${ac} m/s²   Fₒ = ${Fc} N   T = ${Tpr} s   ω = ${om} rad/s`;
                break;
            }
        }
        if (!eq) return;

        const pad=12, bh=26, bx=8, by=SIM.H-bh-8;
        const bw = eq.length*7.0+pad*2;

        ctx.save();
        ctx.globalAlpha = 0.88;
        ctx.fillStyle = '#111327';
        if (ctx.roundRect) ctx.roundRect(bx,by,bw,bh,5);
        else ctx.rect(bx,by,bw,bh);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#a5b4fc';
        ctx.font = '12px "Fira Code",monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(eq, bx+pad, by+bh/2);
        ctx.restore();
    }

    // ─── Public API ────────────────────────────────────────────────────────────

    /** Update a physics parameter and reset the scene. */
    updateParam(id, value) {
        this.params[id] = parseFloat(value);
        // Restitution can be changed live (Matter.js property)
        if (this.sceneType === 'collision' && id === 'restitution') {
            [this.bodies.ball1, this.bodies.ball2].forEach(b => {
                if (b) b.restitution = parseFloat(value);
            });
            return; // no rebuild needed
        }
        this._buildScene();
    }

    pause() {
        if (this.runner) { Matter.Runner.stop(this.runner); this.running = false; }
    }

    play() {
        if (this.runner && !this.running) {
            Matter.Runner.run(this.runner, this.engine);
            this.running = true;
        }
    }

    reset() {
        this._buildScene();
        if (!this.running) this.play();
    }

    setSpeed(factor) {
        if (this.engine) this.engine.timing.timeScale = parseFloat(factor);
    }

    destroy() {
        try {
            if (this.runner) Matter.Runner.stop(this.runner);
            if (this.render) Matter.Render.stop(this.render);
            if (this.engine) {
                Matter.Composite.clear(this.engine.world);
                Matter.Engine.clear(this.engine);
            }
        } catch (_) {}
    }
}
