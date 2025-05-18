class Process {
    constructor(name, type, priority, executionTime, currentTime) {
      this.name = name;
      this.type = type; // 'cpu' ou 'io'
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
      this.recordState('Criado', currentTime); // Registra estado inicial
    }

    // Registra mudança de estado com timestamp
    recordState(newState, time) {
      if (this.stateHistory.length > 0 && time <= this.stateHistory[this.stateHistory.length-1].time) {
        time = this.stateHistory[this.stateHistory.length-1].time + 1;
      }

      this.stateHistory.push({
        state: newState,
        time: time,
        priority: this.dynamicPriority
      });
      this.status = newState;
      this.lastStateChangeTime = time;
    }
    
    // Atualiza prioridade dinâmica considerando:
    // - Tempo de espera (aging)
    // - Tipo de processo (I/O-bound ganha prioridade)
    // - Uso excessivo de CPU (CPU-bound perde prioridade)
    updateDynamicPriority(currentTime, agingFactor) {
      const waitTime = currentTime - this.lastRunTime;
      let priorityChange = Math.floor(waitTime / (1000 / agingFactor));
      
      // Ajusta prioridade baseado no tipo de processo
      if (this.type === 'io') {
        priorityChange += 1; // Processos I/O-bound ganham prioridade moderada
      }
      
      // Processos CPU-bound perdem prioridade se usarem muito tempo de CPU
      if (this.type === 'cpu' && this.totalCpuTime > 2000) {
        priorityChange -= Math.floor(this.totalCpuTime / 1000);
      }
      
      // Define a nova prioridade
      this.dynamicPriority = Math.max(1, Math.min(10, this.originalPriority + priorityChange));
    }
  
    // Executa o processo por um time slice e retorna:
    // 'io' - se precisa fazer operação de I/O
    // 'completed' - se terminou
    // 'running' - se ainda precisa executar
    execute(timeSlice) {
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
      // Filas de processos
      this.readyQueue = [];
      this.waitingQueue = [];
      this.executionQueue = [];

      // Lista completa e controle de execução
      this.allProcesses = [];
      this.running = false;
      this.interval = null;

      // Métricas e configurações
      this.currentTime = 0;
      this.completedTasks = 0;
      this.totalWaitingTime = 0;
      this.startTime = null;
      this.timeQuantum = 500;
      this.agingFactor = 5;
      
      // Visualização
      this.stateTransitions = [];
      this.stateChart = null;
      this.selectedProcess = null;
      this.baseTickInterval = 500; // Velocidade base (500ms por tick)
      this.speed = 1;
      this.nextTickTime = 0;

      // Mapa para rastrear cores usadas por processo
      this.assignedColors = {};
  
      this.init();
    }
  
    init() {
      document.getElementById('processForm').addEventListener('submit', (e) => {
        e.preventDefault();
        this.createProcess();
      });

      document.getElementById('speedSelect').addEventListener('change', (e) => {
        this.setSpeed(e.target.value);
        document.querySelectorAll('#speedSelect option').forEach(opt => {
          opt.selected = opt.value === e.target.value;
        });
      });

      document.getElementById('massEditBtn').addEventListener('click', () => this.openMassEditModal());
        document.getElementById('saveAllPriorities').addEventListener('click', () => this.saveAllPriorities());
        
        // Modify existing priority modal close handler
        document.querySelectorAll('.modal .close').forEach(closeBtn => {
          closeBtn.addEventListener('click', () => {
            closeBtn.closest('.modal').style.display = 'none';
          });
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
  
      // document.getElementById('applyPriority').addEventListener('click', () => {
      //   const newPriority = parseInt(document.getElementById('newPriority').value);
      //   if (this.selectedProcess && newPriority >= 1 && newPriority <= 10) {
      //     this.selectedProcess.originalPriority = newPriority;
      //     this.selectedProcess.dynamicPriority = newPriority;
      //     this.updateUI();
      //   }
      //   document.getElementById('priorityModal').style.display = 'none';
      // });

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
            datasets: [] 
          },
          options: {
            responsive: true,
            // maintainAspectRatio: false,
            animation: {
              duration: 0 // Disable animations for real-time updates
            },
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
                min: 0,
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
                    return `${context.dataset.label}: ${context.parsed.x}ms`;
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
          'waiting': 'Espera',
          'completed': 'Concluído',
        };
      
        this.allProcesses.forEach(process => {
          // Filtra apenas os estados relevantes e ordena por tempo
          const relevantStates = process.stateHistory
            .filter(state => ['ready', 'running', 'waiting', 'completed'].includes(state.state))
            .sort((a, b) => a.time - b.time);
      
          if (relevantStates.length === 0) return;
      
          const dataPoints = [];
          let lastTime = 0;
          let lastState = 'ready'; // Estado inicial padrão

          if (relevantStates[0].time > 0) {
            dataPoints.push({ x: 0, y: stateLevels['ready'] });
          }

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
          if (process.status === 'completed') {
            dataPoints.push({
              x: lastTime,
              y: stateLevels['completed']
            });
          } 
          else {
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
      
      // getProcessColor(process) {
      //   // Se já tiver uma cor atribuída, retorna ela
      //   if (this.assignedColors[process.name]) {
      //     return this.assignedColors[process.name];
      //   }
        
      //   // Conta quantos processos do mesmo tipo já existem
      //   const sameTypeCount = this.allProcesses
      //     .filter(p => p.type === process.type).length;
        
      //   // Seleciona uma cor baseada no tipo e na quantidade
      //   const colorPalette = this.processColors[process.type] || ['#9b59b6'];
      //   const colorIndex = sameTypeCount % colorPalette.length;
        
      //   // Armazena a cor atribuída
      //   this.assignedColors[process.name] = colorPalette[colorIndex];
        
      //   return this.assignedColors[process.name];
      // }

    getProcessColor(process) {
        // Se já tiver uma cor atribuída, retorna ela
        if (this.assignedColors[process.name]) {
            return this.assignedColors[process.name];
        }
        
        // Gera uma cor única baseada no nome/tipo do processo
        const hashString = process.name + process.type; // Combina nome e tipo para maior unicidade
        let hash = 0;
        
        // Cria um hash simples a partir da string
        for (let i = 0; i < hashString.length; i++) {
            hash = hashString.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        // Converte o hash em uma cor HEX
        let color = '#';
        for (let i = 0; i < 3; i++) {
            const value = (hash >> (i * 8)) & 0xFF;
            // Ajusta para evitar cores muito claras ou muito escuras
            const adjustedValue = 80 + (value % 120); // Range entre 80-200 para cada componente
            color += ('00' + adjustedValue.toString(16)).substr(-2);
        }
        
        // Armazena a cor atribuída
        this.assignedColors[process.name] = color;
        
        return color;
    }
    
    // Obtém as mudanças de estado de um processo para o gráfico
    getProcessStateChanges(process) {
      if (!process.stateHistory || process.stateHistory.length === 0) return [];
      
      const stateMap = {
        'ready': 'Pronto',
        'running': 'Execução',
        'waiting': 'Espera',
        'completed': 'Pronto'
      };
      
      const points = [];
      
      // Adiciona ponto inicial se necessário
      if (process.stateHistory[0].time > 0) {
        points.push({
          x: 0,
          y: stateMap['ready']
        });
      }
      
      // Adiciona todas as mudanças de estado
      for (const state of process.stateHistory) {
        points.push({
          x: state.time,
          y: stateMap[state.state] || state.state
        });
      }
      
      // Adiciona estado atual se não estiver concluído
      if (process.status !== 'completed') {
        points.push({
          x: this.currentTime,
          y: stateMap[process.status] || process.status
        });
      }
      
      return points;
    }
    
    // Cria um novo processo a partir dos dados do formulário
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
      if (!this.running) {
        this.running = true;
        this.nextTickTime = Date.now(); // Reinicia o tempo ao iniciar
        this.scheduleTick();
      }
    }
    
    // Pausa a simulação
    pause() {
      this.running = false;
      clearTimeout(this.interval);
    }
    
    // Reinicia toda a simulação
    reset() {
      this.pause();
      this.readyQueue = [];
      this.waitingQueue = [];
      this.executionQueue = [];
      this.allProcesses = [];
      this.assignedColors = {};
      this.currentTime = 0;
      this.completedTasks = 0;
      this.totalWaitingTime = 0;
      this.stateTransitions = [];
      this.speed = 1;
      this.updateUI();
      this.updateChart();
    }
    
    // Agenda o próximo tick da simulação
    scheduleTick() {
      if (!this.running) return;
      
      clearTimeout(this.interval); // Limpa timeout anterior
        
      const now = Date.now();
      const adjustedInterval = this.baseTickInterval / this.speed;
      
      // Calcula quando o próximo tick deve acontecer
      this.nextTickTime = Math.max(now, (this.nextTickTime || now) + adjustedInterval);
      
      const delay = Math.max(0, this.nextTickTime - now);
      
      this.interval = setTimeout(() => {
          this.tick();
          this.scheduleTick();
      }, delay);
    }

    // Executa um ciclo da simulação
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
  
      // Escolhe próximo processo se não houver em execução
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
        document.getElementById('downloadBtnPdf').style.display = 'inline-block'; // Mostra o botão de download
      }
    }
  
    // Verifica processos em espera por I/O
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
    
    // Agenda o próximo processo para execução
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
  
    // Executa o processo atual
    executeCurrentProcess() {
      if (this.executionQueue.length === 0) return;
  
      const currentProcess = this.executionQueue[0];
      const result = currentProcess.execute(100);
  
      if (result === 'io') {
        // Processo precisa fazer I/O
        currentProcess.ioWaitTime = 500 + Math.floor(Math.random() * 500); // Tempo aleatório de I/O
        currentProcess.recordState('waiting', this.currentTime);
        this.waitingQueue.push(currentProcess);
        this.executionQueue.shift();
        this.logStateTransition(currentProcess, 'running', 'waiting');
      } else if (result === 'completed') {
        // Processo concluído
        currentProcess.recordState('running', this.currentTime - 1); 
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
  
    // Registra uma transição de estado
    logStateTransition(process, fromState, toState) {
      const stateMap = {
        'ready': 'Pronto',
        'running': 'Execução',
        'waiting': 'Espera',
        'completed': 'Concluído'
      };
  
      const transition = {
        process: (process.name + " - " + process.type),
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
  
    // Atualiza a exibição de uma fila de processos
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
          
          div.addEventListener('click', (e) => {
              if (e.target.tagName !== 'BUTTON') {
                  this.pause(); 
                  this.selectedProcess = p;
                  document.getElementById('newPriority').value = p.originalPriority;
                  document.getElementById('priorityModal').style.display = 'block';
              }
          });
          
          container.appendChild(div);
      });
    }
  
    // Retorna o nome do tipo de processo
    getProcessTypeName(type) {
      const types = {
        'cpu': 'CPU-bound',
        'io': 'I/O-bound',
      };
      return types[type] || type;
    }
  
    // Atualiza a lista de transições de estado
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
  
    // Atualiza toda a interface do usuário
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
  
    // Alterna entre modo claro e escuro
    toggleDarkMode() {
        document.body.classList.toggle('dark-mode');
        // Atualiza o gráfico quando o modo escuro é alternado
        if (this.stateChart) {
          this.stateChart.update();
        }
      }

    // Define a velocidade da simulação
    setSpeed(speed) {
        this.speed = parseFloat(speed);
    }

    // Abre o modal para edição em massa
    openMassEditModal() {
        this.pause(); // Pausa a simulação ao abrir o modal
        
        const modal = document.getElementById('massPriorityModal');
        const processList = document.getElementById('processListForEdit');
        processList.innerHTML = '';
        
        // Adiciona todos os processos ao modal
        this.allProcesses.forEach(process => {
            const item = document.createElement('div');
            item.className = 'process-edit-item';
            item.innerHTML = `
                <span>${process.name} (Prioridade atual: ${process.originalPriority})</span>
                <span class="edit-icon"><i class="bi bi-pencil"></i></span>
            `;
            
            item.addEventListener('click', () => {
                this.selectedProcess = process;
                document.getElementById('newPriority').value = process.originalPriority;
                document.getElementById('priorityModal').style.display = 'block';
            });
            
            processList.appendChild(item);
        });
        
        modal.style.display = 'block';
    }

    // Salva todas as prioridades após edição em massa
    saveAllPriorities() {
        document.getElementById('massPriorityModal').style.display = 'none';
        this.updateUI();
    }
  }
  
  window.onload = () => {
    new DynamicPriorityScheduler();
  };