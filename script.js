class Process {
    constructor(name, type, priority, executionTime, currentTime) {
      this.name = name;
      this.type = type; // 'cpu', 'io', 'interactive'
      this.originalPriority = parseInt(priority);
      this.dynamicPriority = parseInt(priority);
      this.executionTime = parseInt(executionTime);
      this.remainingTime = parseInt(executionTime);
      this.waitingTime = 0;
      this.startTime = null;
      this.status = 'ready';
      this.queueEntryTime = currentTime;
      this.lastRunTime = currentTime;
      this.lastStateChangeTime = currentTime;
      this.ioOperations = this.type === 'io' ? Math.max(1, Math.floor(this.executionTime / 1000)) : 0;
      this.ioInterval = this.type === 'io' ? Math.floor(this.executionTime / (this.ioOperations + 1)) : Infinity;
      this.nextIoTime = this.type === 'io' ? this.ioInterval : Infinity;
      this.totalCpuTime = 0;
      this.stateHistory = [];
      this.recordState('Criado', currentTime);
    }
  
    recordState(newState, time) {
      this.stateHistory.push({
        state: newState,
        time: time,
        priority: this.dynamicPriority
      });
      this.status = newState;
      this.lastStateChangeTime = time;
    }
  
    updateDynamicPriority(currentTime, agingFactor) {
      // Aumenta prioridade com base no tempo de espera (aging)
      const waitTime = currentTime - this.lastRunTime;
      let priorityChange = Math.floor(waitTime / (1000 / agingFactor));
      
      // Ajusta prioridade baseado no tipo de processo
      if (this.type === 'interactive') {
        priorityChange += 2; // Processos interativos ganham mais prioridade
      } else if (this.type === 'io') {
        priorityChange += 1; // Processos I/O-bound ganham prioridade moderada
      }
      
      // Processos CPU-bound perdem prioridade se usaram muito CPU
      if (this.type === 'cpu' && this.totalCpuTime > 2000) {
        priorityChange -= Math.floor(this.totalCpuTime / 1000);
      }
      
      this.dynamicPriority = Math.max(1, Math.min(10, this.originalPriority + priorityChange));
    }
  
    execute(timeSlice, currentTime) {
      const actualSlice = Math.min(timeSlice, this.remainingTime, this.nextIoTime);
      this.remainingTime -= actualSlice;
      this.totalCpuTime += actualSlice;
      
      if (this.type === 'io') {
        this.nextIoTime -= actualSlice;
        if (this.nextIoTime <= 0 && this.ioOperations > 0) {
          this.ioOperations--;
          this.nextIoTime = this.ioInterval;
          return 'io'; // Sinaliza que precisa fazer I/O
        }
      }
      
      return this.remainingTime <= 0 ? 'completed' : 'running';
    }
  }
  
  class DynamicPriorityScheduler {
    constructor() {
      this.readyQueue = [];
      this.waitingQueue = [];
      this.executionQueue = [];
      this.allProcesses = [];
      this.running = false;
      this.interval = null;
      this.currentTime = 0;
      this.completedTasks = 0;
      this.totalWaitingTime = 0;
      this.startTime = null;
      this.timeQuantum = 500;
      this.agingFactor = 5;
      this.stateTransitions = [];
      this.stateChart = null;
      this.selectedProcess = null;
  
      this.init();
    }
  
    init() {
      document.getElementById('processForm').addEventListener('submit', (e) => {
        e.preventDefault();
        this.createProcess();
      });
  
      document.getElementById('startBtn').addEventListener('click', () => this.start());
      document.getElementById('pauseBtn').addEventListener('click', () => this.pause());
      document.getElementById('resetBtn').addEventListener('click', () => this.reset());
      document.getElementById('toggleMode').addEventListener('click', () => this.toggleDarkMode());
      document.getElementById('timeQuantum').addEventListener('change', (e) => {
        this.timeQuantum = parseInt(e.target.value);
      });
      document.getElementById('agingFactor').addEventListener('change', (e) => {
        this.agingFactor = parseInt(e.target.value);
      });
  
      // Tab switching
      document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          
          document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
          });
          document.getElementById(tab.dataset.tab).classList.add('active');
        });
      });
  
      // Priority change modal
      document.querySelector('.close').addEventListener('click', () => {
        document.getElementById('priorityModal').style.display = 'none';
      });
  
      document.getElementById('applyPriority').addEventListener('click', () => {
        const newPriority = parseInt(document.getElementById('newPriority').value);
        if (this.selectedProcess && newPriority >= 1 && newPriority <= 10) {
          this.selectedProcess.originalPriority = newPriority;
          this.selectedProcess.dynamicPriority = newPriority;
          this.updateUI();
        }
        document.getElementById('priorityModal').style.display = 'none';
      });
  
      // Initialize chart
      this.initChart();
  
      this.updateUI();
    }
  
    initChart() {
        const ctx = document.getElementById('stateChart').getContext('2d');
        this.stateChart = new Chart(ctx, {
          type: 'line',
          data: {
            datasets: [] // Inicialmente vazio, será preenchido dinamicamente
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                type: 'category',
                labels: ['Espera', 'Pronto', 'Execução'],
                reverse: true,
                title: {
                  display: true,
                  text: 'Estado'
                }
              },
              x: {
                type: 'linear',
                title: {
                  display: true,
                  text: 'Tempo (ms)'
                },
                min: 0
              }
            },
            plugins: {
              title: {
                display: true,
                text: 'Linha do Tempo dos Processos'
              },
              tooltip: {
                callbacks: {
                  label: (context) => {
                    return `${context.dataset.label}: ${context.parsed.y} em ${context.parsed.x}ms`;
                  }
                }
              }
            }
          }
        });
      }
      
      updateChart() {
        if (!this.stateChart) return;
      
        const datasets = [];
        const stateLevels = {
          'ready': 'Pronto',
          'running': 'Execução',
          'waiting': 'Espera'
        };
      
        this.allProcesses.forEach(process => {
          // Filtra apenas os estados relevantes e ordena por tempo
          const relevantStates = process.stateHistory
            .filter(state => ['ready', 'running', 'waiting'].includes(state.state))
            .sort((a, b) => a.time - b.time);
      
          if (relevantStates.length === 0) return;
      
          const dataPoints = [];
          let lastTime = 0;
          let lastState = 'ready'; // Estado inicial padrão
      
          // Adiciona ponto inicial (assume que começa em pronto no tempo 0)
          dataPoints.push({
            x: 0,
            y: stateLevels['ready']
          });
      
          // Processa cada transição de estado
          relevantStates.forEach(state => {
            // Adiciona ponto final do estado anterior
            dataPoints.push({
              x: state.time,
              y: stateLevels[lastState]
            });
            
            // Adiciona ponto inicial do novo estado
            dataPoints.push({
              x: state.time,
              y: stateLevels[state.state]
            });
            
            lastState = state.state;
            lastTime = state.time;
          });
      
          // Adiciona o estado atual até o tempo corrente (se não estiver completado)
          if (process.status !== 'completed') {
            dataPoints.push({
              x: this.currentTime,
              y: stateLevels[process.status]
            });
          }
      
          datasets.push({
            label: process.name,
            data: dataPoints,
            borderColor: this.getProcessColor(process),
            backgroundColor: this.getProcessColor(process),
            borderWidth: 2,
            pointRadius: 3,
            tension: 0,
            stepped: 'after' // Faz o gráfico ter degraus nos pontos de transição
          });
        });
      
        this.stateChart.data.datasets = datasets;
        this.stateChart.update();
      }
      
      getProcessColor(process) {
        switch (process.type) {
          case 'cpu': return '#e74c3c'; // Vermelho para CPU-bound
          case 'io': return '#3498db';  // Azul para I/O-bound
          case 'interactive': return '#2ecc71'; // Verde para interativo
          default: return '#9b59b6';
        }
      }
  
    getProcessStateChanges(process) {
      if (!process.stateHistory || process.stateHistory.length === 0) return [];
      
      const stateMap = {
        'ready': 'Pronto',
        'running': 'Execução',
        'waiting': 'Espera',
        'completed': 'Pronto'
      };
      
      const points = [];
      
      // Add initial point if needed
      if (process.stateHistory[0].time > 0) {
        points.push({
          x: 0,
          y: stateMap['ready']
        });
      }
      
      // Add all state changes
      for (const state of process.stateHistory) {
        points.push({
          x: state.time,
          y: stateMap[state.state] || state.state
        });
      }
      
      // Add current state if not completed
      if (process.status !== 'completed') {
        points.push({
          x: this.currentTime,
          y: stateMap[process.status] || process.status
        });
      }
      
      return points;
    }
  
    createProcess() {
      const name = document.getElementById('taskName').value;
      const type = document.getElementById('processType').value;
      const priority = document.getElementById('priority').value;
      const executionTime = document.getElementById('executionTime').value;
  
      if (!name || !type || !priority || !executionTime) return;
  
      const process = new Process(name, type, priority, executionTime, this.currentTime);
      this.readyQueue.push(process);
      this.allProcesses.push(process);
      
      this.logStateTransition(process, 'Criado', 'ready');
      this.updateUI();
      document.getElementById('processForm').reset();
    }
  
    start() {
      if (!this.running && (this.readyQueue.length + this.waitingQueue.length > 0 || this.allProcesses.length === 0)) {
        this.running = true;
        this.startTime = Date.now();
        this.scheduleTick();
      }
    }
  
    pause() {
      this.running = false;
      clearTimeout(this.interval);
    }
  
    reset() {
      this.pause();
      this.readyQueue = [];
      this.waitingQueue = [];
      this.executionQueue = [];
      this.allProcesses = [];
      this.currentTime = 0;
      this.completedTasks = 0;
      this.totalWaitingTime = 0;
      this.stateTransitions = [];
      this.updateUI();
      this.updateChart();
    }
  
    scheduleTick() {
      if (!this.running) return;
      
      // Ajusta a velocidade da simulação baseado no número de processos
      const speedFactor = Math.max(100, 500 - (this.allProcesses.length * 20));
      
      this.interval = setTimeout(() => {
        this.tick();
        this.scheduleTick();
      }, speedFactor);
    }
  
    tick() {
      if (!this.running) return;
  
      this.currentTime += 100;
  
      // Atualiza prioridades dos processos na fila de pronto
      this.readyQueue.forEach(process => {
        process.waitingTime = this.currentTime - process.queueEntryTime;
        process.updateDynamicPriority(this.currentTime, this.agingFactor);
      });
  
      // Verifica processos em espera (I/O)
      this.checkWaitingProcesses();
  
      // Se não há processo em execução, escolhe o próximo
      if (this.executionQueue.length === 0 && this.readyQueue.length > 0) {
        this.scheduleNextProcess();
      }
  
      // Executa o processo atual
      this.executeCurrentProcess();
  
      this.updateUI();
      this.updateChart();
  
      // Verifica se todos os processos foram concluídos
      if (this.allProcesses.length > 0 && this.allProcesses.every(p => p.status === 'completed')) {
        this.pause();
      }
    }
  
    checkWaitingProcesses() {
      const completedIo = [];
      
      this.waitingQueue.forEach((process, index) => {
        process.ioWaitTime -= 100;
        
        if (process.ioWaitTime <= 0) {
          completedIo.unshift(index); // Adiciona índices em ordem reversa para remoção segura
          process.queueEntryTime = this.currentTime;
          process.recordState('ready', this.currentTime);
          this.readyQueue.push(process);
          this.logStateTransition(process, 'waiting', 'ready');
        }
      });
      
      // Remove processos que completaram I/O
      completedIo.forEach(index => {
        this.waitingQueue.splice(index, 1);
      });
    }
  
    scheduleNextProcess() {
      // Ordena por prioridade dinâmica (maior primeiro)
      this.readyQueue.sort((a, b) => {
        if (b.dynamicPriority !== a.dynamicPriority) {
          return b.dynamicPriority - a.dynamicPriority;
        }
        // Desempate pelo menor tempo de espera
        return a.waitingTime - b.waitingTime;
      });
  
      const nextProcess = this.readyQueue.shift();
      if (nextProcess) {
        nextProcess.startTime = nextProcess.startTime || this.currentTime;
        nextProcess.lastRunTime = this.currentTime;
        nextProcess.recordState('running', this.currentTime);
        this.executionQueue.push(nextProcess);
        this.logStateTransition(nextProcess, 'ready', 'running');
      }
    }
  
    executeCurrentProcess() {
      if (this.executionQueue.length === 0) return;
  
      const currentProcess = this.executionQueue[0];
      const result = currentProcess.execute(100, this.currentTime);
  
      if (result === 'io') {
        // Processo precisa fazer I/O
        currentProcess.ioWaitTime = 500 + Math.floor(Math.random() * 500); // Tempo aleatório de I/O
        currentProcess.recordState('waiting', this.currentTime);
        this.waitingQueue.push(currentProcess);
        this.executionQueue.shift();
        this.logStateTransition(currentProcess, 'running', 'waiting');
      } else if (result === 'completed') {
        // Processo concluído
        currentProcess.recordState('completed', this.currentTime);
        this.completedTasks++;
        this.totalWaitingTime += currentProcess.waitingTime;
        this.executionQueue.shift();
        this.logStateTransition(currentProcess, 'running', 'completed');
      } else if (this.currentTime - currentProcess.lastRunTime >= this.timeQuantum) {
        // Quantum expirado - preempção
        currentProcess.recordState('ready', this.currentTime);
        currentProcess.queueEntryTime = this.currentTime;
        this.readyQueue.push(currentProcess);
        this.executionQueue.shift();
        this.logStateTransition(currentProcess, 'running', 'ready');
      }
    }
  
    logStateTransition(process, fromState, toState) {
      const stateMap = {
        'ready': 'Pronto',
        'running': 'Execução',
        'waiting': 'Espera',
        'completed': 'Concluído'
      };
  
      const transition = {
        process: process.name,
        from: stateMap[fromState] || fromState,
        to: stateMap[toState] || toState,
        time: this.currentTime,
        priority: process.dynamicPriority
      };
      
      this.stateTransitions.push(transition);
      
      // Mantém apenas as últimas 50 transições
      if (this.stateTransitions.length > 50) {
        this.stateTransitions.shift();
      }
    }
  
    updateQueueDisplay(id, queue) {
      const container = document.querySelector(`#${id} .process-list`);
      const countElement = document.querySelector(`#${id} .count`);
      countElement.textContent = queue.length;
      
      container.innerHTML = '';
      
      queue.forEach(p => {
        const div = document.createElement('div');
        div.className = `process-item ${p.status}`;
        
        const progressPercent = ((p.executionTime - p.remainingTime) / p.executionTime) * 100;
        
        div.innerHTML = `
          <div class="process-info">
            <strong>${p.name}</strong> (${this.getProcessTypeName(p.type)})
            <div class="process-details">
              P: ${p.dynamicPriority} (orig ${p.originalPriority}) | 
              R: ${p.remainingTime}ms
            </div>
          </div>
          <div class="progress" style="width: ${progressPercent}%"></div>
        `;
        
        div.addEventListener('click', () => {
          this.selectedProcess = p;
          document.getElementById('newPriority').value = p.originalPriority;
          document.getElementById('priorityModal').style.display = 'block';
        });
        
        container.appendChild(div);
      });
    }
  
    getProcessTypeName(type) {
      const types = {
        'cpu': 'CPU-bound',
        'io': 'I/O-bound',
        'interactive': 'Interativo'
      };
      return types[type] || type;
    }
  
    updateStateTransitions() {
      const container = document.getElementById('stateTransitions');
      container.innerHTML = '';
      
      // Mostra as transições mais recentes primeiro
      const recentTransitions = [...this.stateTransitions].reverse();
      
      recentTransitions.forEach(t => {
        const div = document.createElement('div');
        div.className = 'state-transition';
        
        div.innerHTML = `
          <span class="process">${t.process}</span>
          <span class="transition">${t.from} → ${t.to}</span>
          <span class="priority">P:${t.priority}</span>
          <span class="time">${t.time}ms</span>
        `;
        
        container.appendChild(div);
      });
    }
  
    updateUI() {
      this.updateQueueDisplay('readyQueue', this.readyQueue);
      this.updateQueueDisplay('waitingQueue', this.waitingQueue);
      this.updateQueueDisplay('executionQueue', this.executionQueue);
      
      document.getElementById('completedTasks').textContent = this.completedTasks;
      
      const avgWait = this.completedTasks > 0
        ? (this.totalWaitingTime / this.completedTasks).toFixed(2)
        : 0;
      document.getElementById('avgWaitingTime').textContent = avgWait;
      
      const elapsedSeconds = this.currentTime / 1000;
      const throughput = elapsedSeconds > 0 ? (this.completedTasks / elapsedSeconds).toFixed(2) : 0;
      document.getElementById('throughput').textContent = throughput;
      
      document.getElementById('simulationTime').textContent = this.currentTime;
      
      this.updateStateTransitions();
    }
  
    toggleDarkMode() {
        document.body.classList.toggle('dark-mode');
        // Atualiza o gráfico quando o modo escuro é alternado
        if (this.stateChart) {
          this.stateChart.update();
        }
      }
  }
  
  window.onload = () => {
    new DynamicPriorityScheduler();
  };