import { WebsimSocket } from 'https://cdn.jsdelivr.net/npm/websim-socket@latest/dist/index.js';

class WebsimLive {
    constructor() {
        this.room = new WebsimSocket();
        this.projects = new Map();
        this.userCursors = new Map();
        this.isDragging = false;
        this.dragTarget = null;
        this.dragOffset = { x: 0, y: 0 };
        this.gridVisible = true;
        
        this.init();
    }

    async init() {
        await this.room.initialize();
        
        // Set up user info
        const userInfo = this.room.peers[this.room.clientId];
        document.getElementById('user-avatar').src = userInfo.avatarUrl;
        document.getElementById('user-name').textContent = userInfo.username;
        
        // Subscribe to state changes
        this.room.subscribeRoomState((state) => {
            this.handleRoomStateUpdate(state);
        });
        
        this.room.subscribePresence((presence) => {
            this.handlePresenceUpdate(presence);
        });
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Initialize with existing projects
        if (this.room.roomState.projects) {
            Object.entries(this.room.roomState.projects).forEach(([id, project]) => {
                this.addProjectFrame(id, project);
            });
        }
        
        // Track mouse movement for cursors
        this.trackMouseMovement();
    }

    setupEventListeners() {
        // Add project button
        document.getElementById('add-project').addEventListener('click', () => {
            this.showProjectSelector();
        });
        
        // Toggle grid
        document.getElementById('toggle-grid').addEventListener('click', () => {
            this.toggleGrid();
        });
        
        // Clear all
        document.getElementById('clear-all').addEventListener('click', () => {
            this.clearAllProjects();
        });
        
        // Modal controls
        document.querySelector('.close-modal').addEventListener('click', () => {
            document.getElementById('project-selector').classList.add('hidden');
        });
        
        // Drag and drop
        const workspace = document.getElementById('workspace');
        workspace.addEventListener('mousedown', this.handleMouseDown.bind(this));
        workspace.addEventListener('mousemove', this.handleMouseMove.bind(this));
        workspace.addEventListener('mouseup', this.handleMouseUp.bind(this));
        
        // Touch support
        workspace.addEventListener('touchstart', this.handleTouchStart.bind(this));
        workspace.addEventListener('touchmove', this.handleTouchMove.bind(this));
        workspace.addEventListener('touchend', this.handleTouchEnd.bind(this));
    }

    showProjectSelector() {
        const modal = document.getElementById('project-selector');
        const projectList = document.getElementById('project-list');
        
        // Sample projects - in real implementation, this would fetch from websim API
        const sampleProjects = [
            { id: 'tetris', name: 'Tetris Game', url: 'https://websim.ai/tetris' },
            { id: 'drawing', name: 'Drawing App', url: 'https://websim.ai/drawing' },
            { id: 'chat', name: 'Chat Room', url: 'https://websim.ai/chat' },
            { id: 'music', name: 'Music Player', url: 'https://websim.ai/music' },
            { id: 'weather', name: 'Weather App', url: 'https://websim.ai/weather' },
            { id: 'calculator', name: 'Calculator', url: 'https://websim.ai/calculator' },
            { id: 'pong', name: 'Pong Game', url: 'https://websim.ai/pong' },
            { id: 'todo', name: 'Todo List', url: 'https://websim.ai/todo' }
        ];
        
        projectList.innerHTML = '';
        sampleProjects.forEach(project => {
            const item = document.createElement('div');
            item.className = 'project-item';
            item.innerHTML = `
                <h3>${project.name}</h3>
                <p>Click to open</p>
            `;
            item.addEventListener('click', () => {
                this.createProject(project.id, project.name, project.url);
                modal.classList.add('hidden');
            });
            projectList.appendChild(item);
        });
        
        modal.classList.remove('hidden');
    }

    createProject(id, name, url) {
        const projectId = `${id}-${Date.now()}`;
        const project = {
            id: projectId,
            name: name,
            url: url,
            x: Math.random() * (window.innerWidth - 400),
            y: Math.random() * (window.innerHeight - 300),
            zIndex: this.projects.size
        };
        
        this.room.updateRoomState({
            projects: {
                ...this.room.roomState.projects,
                [projectId]: project
            }
        });
    }

    addProjectFrame(id, project) {
        if (this.projects.has(id)) return;
        
        const frame = document.createElement('div');
        frame.className = 'project-frame';
        frame.id = `project-${id}`;
        frame.style.left = `${project.x}px`;
        frame.style.top = `${project.y}px`;
        frame.style.zIndex = project.zIndex;
        
        frame.innerHTML = `
            <div class="project-header">
                <span class="project-title">${project.name}</span>
                <button class="close-project" data-project="${id}">×</button>
            </div>
            <iframe src="${project.url}" frameborder="0"></iframe>
        `;
        
        document.getElementById('workspace').appendChild(frame);
        this.projects.set(id, { element: frame, data: project });
        
        // Close button
        frame.querySelector('.close-project').addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeProject(id);
        });
    }

    removeProject(id) {
        if (this.projects.has(id)) {
            this.projects.get(id).element.remove();
            this.projects.delete(id);
            
            const newProjects = { ...this.room.roomState.projects };
            delete newProjects[id];
            this.room.updateRoomState({ projects: newProjects });
        }
    }

    handleRoomStateUpdate(state) {
        const projects = state.projects || {};
        
        // Add new projects
        Object.entries(projects).forEach(([id, project]) => {
            if (!this.projects.has(id)) {
                this.addProjectFrame(id, project);
            }
        });
        
        // Remove deleted projects
        this.projects.forEach((_, id) => {
            if (!projects[id]) {
                this.removeProject(id);
            }
        });
        
        // Update positions
        Object.entries(projects).forEach(([id, project]) => {
            if (this.projects.has(id)) {
                const frame = this.projects.get(id).element;
                frame.style.left = `${project.x}px`;
                frame.style.top = `${project.y}px`;
                frame.style.zIndex = project.zIndex;
            }
        });
    }

    handlePresenceUpdate(presence) {
        // Update cursors
        Object.entries(presence).forEach(([clientId, data]) => {
            if (clientId === this.room.clientId) return;
            
            if (data.mouseX !== undefined && data.mouseY !== undefined) {
                this.updateUserCursor(clientId, data);
            }
        });
    }

    updateUserCursor(clientId, data) {
        let cursor = this.userCursors.get(clientId);
        
        if (!cursor) {
            cursor = document.createElement('div');
            cursor.className = 'user-cursor';
            const peer = this.room.peers[clientId];
            cursor.innerHTML = `
                <div class="cursor-dot"></div>
                <div class="cursor-label">${peer.username}</div>
            `;
            document.getElementById('user-cursors').appendChild(cursor);
            this.userCursors.set(clientId, cursor);
        }
        
        cursor.style.left = `${data.mouseX}px`;
        cursor.style.top = `${data.mouseY}px`;
    }

    handleMouseDown(e) {
        const target = e.target.closest('.project-frame');
        if (!target) return;
        
        this.isDragging = true;
        this.dragTarget = target;
        target.classList.add('dragging');
        
        const rect = target.getBoundingClientRect();
        this.dragOffset = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    handleMouseMove(e) {
        this.updateMousePosition(e.clientX, e.clientY);
        
        if (this.isDragging && this.dragTarget) {
            const x = e.clientX - this.dragOffset.x;
            const y = e.clientY - this.dragOffset.y;
            
            this.dragTarget.style.left = `${x}px`;
            this.dragTarget.style.top = `${y}px`;
            
            const projectId = this.dragTarget.id.replace('project-', '');
            this.room.updateRoomState({
                projects: {
                    ...this.room.roomState.projects,
                    [projectId]: {
                        ...this.room.roomState.projects[projectId],
                        x,
                        y
                    }
                }
            });
        }
    }

    handleMouseUp() {
        if (this.isDragging && this.dragTarget) {
            this.dragTarget.classList.remove('dragging');
        }
        this.isDragging = false;
        this.dragTarget = null;
    }

    handleTouchStart(e) {
        const touch = e.touches[0];
        const target = touch.target.closest('.project-frame');
        if (!target) return;
        
        e.preventDefault();
        this.handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY, target });
    }

    handleTouchMove(e) {
        const touch = e.touches[0];
        this.handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
    }

    handleTouchEnd() {
        this.handleMouseUp();
    }

    trackMouseMovement() {
        const updateMouse = (e) => {
            this.updateMousePosition(e.clientX, e.clientY);
        };
        
        document.addEventListener('mousemove', updateMouse);
        document.addEventListener('mouseleave', () => {
            this.room.updatePresence({ mouseX: null, mouseY: null });
        });
    }

    updateMousePosition(x, y) {
        this.room.updatePresence({ mouseX: x, mouseY: y });
    }

    toggleGrid() {
        this.gridVisible = !this.gridVisible;
        const grid = document.querySelector('.grid-overlay');
        grid.style.display = this.gridVisible ? 'block' : 'none';
    }

    clearAllProjects() {
        this.room.updateRoomState({ projects: {} });
    }
}

// Initialize the app
new WebsimLive();

