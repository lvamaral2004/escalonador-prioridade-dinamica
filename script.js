class Processo {
    constructor(nome, tipo, prioridade, tempoExecucao, tempoAtual) {
      this.nome = nome;
      this.tipo = tipo; // 'cpu' ou 'io'
      this.prioridadeOriginal = parseInt(prioridade);
      this.prioridadeDinamica = parseInt(prioridade);
      this.tempoExecucao = parseInt(tempoExecucao);
      this.tempoRestante = parseInt(tempoExecucao);
      this.tempoEspera = 0;
      this.tempoInicio = null;
      this.estado = 'pronto';
      this.tempoEntradaFila = tempoAtual;
      this.tempoUltimaExecucao = tempoAtual;
      this.tempoUltimaMudancaEstado = tempoAtual;
      this.operacoesIO = this.tipo === 'io' ? Math.max(1, Math.floor(this.tempoExecucao / 1000)) : 0;
      this.intervaloIO = this.tipo === 'io' ? Math.floor(this.tempoExecucao / (this.operacoesIO + 1)) : Infinity;
      this.proximoTempoIO = this.tipo === 'io' ? this.intervaloIO : Infinity;
      this.tempoTotalCPU = 0;
      this.historicoEstados = [];
      this.registrarEstado('Criado', tempoAtual); // Registra estado inicial
    }

    // Registra mudança de estado com timestamp
    registrarEstado(novoEstado, tempo) {
      if (this.historicoEstados.length > 0 && tempo <= this.historicoEstados[this.historicoEstados.length-1].tempo) {
        tempo = this.historicoEstados[this.historicoEstados.length-1].tempo + 1;
      }

      this.historicoEstados.push({
        estado: novoEstado,
        tempo: tempo,
        prioridade: this.prioridadeDinamica
      });
      this.estado = novoEstado;
      this.tempoUltimaMudancaEstado = tempo;
    }
    
    // Atualiza prioridade dinâmica considerando:
    // - Tempo de espera (aging)
    // - Tipo de processo (I/O-bound ganha prioridade)
    // - Uso excessivo de CPU (CPU-bound perde prioridade)
    atualizarPrioridadeDinamica(tempoAtual, fatorEnvelhecimento) {
      const tempoEspera = tempoAtual - this.tempoUltimaExecucao;
      let mudancaPrioridade = Math.floor(tempoEspera / (1000 / fatorEnvelhecimento));
      
      // Ajusta prioridade baseado no tipo de processo
      if (this.tipo === 'io') {
        mudancaPrioridade += 1; // Processos I/O-bound ganham prioridade moderada
      }
      
      // Processos CPU-bound perdem prioridade se usarem muito tempo de CPU
      if (this.tipo === 'cpu' && this.tempoTotalCPU > 2000) {
        mudancaPrioridade -= Math.floor(this.tempoTotalCPU / 1000);
      }
      
      // Define a nova prioridade
      this.prioridadeDinamica = Math.max(1, Math.min(10, mudancaPrioridade));
    }
  
    // Executa o processo por um time slice e retorna:
    // 'io' - se precisa fazer operação de I/O
    // 'completed' - se terminou
    // 'running' - se ainda precisa executar
    executar(quantum) {
      const quantumReal = Math.min(quantum, this.tempoRestante, this.proximoTempoIO);
      this.tempoRestante -= quantumReal;
      this.tempoTotalCPU += quantumReal;
      
      if (this.tipo === 'io') {
        this.proximoTempoIO -= quantumReal;
        if (this.proximoTempoIO <= 0 && this.operacoesIO > 0) {
          this.operacoesIO--;
          this.proximoTempoIO = this.intervaloIO;
          return 'io'; // Sinaliza que precisa fazer I/O
        }
      }
      
      return this.tempoRestante <= 0 ? 'completed' : 'running';
    }
  }
  
  class EscalonadorPrioridadeDinamica {
    constructor() {
      // Filas de processos
      this.filaProntos = [];
      this.filaEspera = [];
      this.filaExecucao = [];

      // Lista completa e controle de execução
      this.todosProcessos = [];
      this.executando = false;
      this.intervalo = null;

      // Métricas e configurações
      this.tempoAtual = 0;
      this.tarefasConcluidas = 0;
      this.tempoTotalEspera = 0;
      this.tempoInicio = null;
      this.quantum = 500;
      this.fatorEnvelhecimento = 5;
      
      // Visualização
      this.transicoesEstado = [];
      this.graficoEstados = null;
      this.processoSelecionado = null;
      this.intervaloBaseTick = 500; // Velocidade base (500ms por tick)
      this.velocidade = 1;
      this.proximoTick = 0;

      // Mapa para rastrear cores usadas por processo
      this.coresAtribuidas = {};
  
      this.inicializar();
    }
  
    inicializar() {
      document.getElementById('processForm').addEventListener('submit', (e) => {
        e.preventDefault();
        this.criarProcesso();
      });

      document.getElementById('speedSelect').addEventListener('change', (e) => {
        this.definirVelocidade(e.target.value);
        document.querySelectorAll('#speedSelect option').forEach(opt => {
          opt.selected = opt.value === e.target.value;
        });
      });

      document.getElementById('massEditBtn').addEventListener('click', () => this.abrirModalEdicaoEmMassa());
        document.getElementById('saveAllPriorities').addEventListener('click', () => this.salvarTodasPrioridades());
        
        // Modify existing priority modal close handler
        document.querySelectorAll('.modal .close').forEach(closeBtn => {
          closeBtn.addEventListener('click', () => {
            closeBtn.closest('.modal').style.display = 'none';
          });
      });
  
      document.getElementById('startBtn').addEventListener('click', () => this.iniciar());
      document.getElementById('pauseBtn').addEventListener('click', () => this.pausar());
      document.getElementById('resetBtn').addEventListener('click', () => this.reiniciar());
      document.getElementById('toggleMode').addEventListener('click', () => this.alternarModoEscuro());
      document.getElementById('timeQuantum').addEventListener('change', (e) => {
        this.quantum = parseInt(e.target.value);
      });
      document.getElementById('agingFactor').addEventListener('change', (e) => {
        this.fatorEnvelhecimento = parseInt(e.target.value);
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
        const novaPrioridade = parseInt(document.getElementById('newPriority').value);
        if (this.processoSelecionado && novaPrioridade >= 1 && novaPrioridade <= 10) {
            this.processoSelecionado.prioridadeOriginal = novaPrioridade;
            this.processoSelecionado.prioridadeDinamica = novaPrioridade;
            this.atualizarUI();
        }
        document.getElementById('priorityModal').style.display = 'none';
    });
  
      // Initialize chart
      this.inicializarGrafico();
  
      this.atualizarUI();
    }
  
    inicializarGrafico() {
        const ctx = document.getElementById('stateChart').getContext('2d');
        this.graficoEstados = new Chart(ctx, {
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
      
      atualizarGrafico() {
        if (!this.graficoEstados) return;
      
        const datasets = [];
        const niveisEstado = {
          'ready': 'Pronto',
          'running': 'Execução',
          'waiting': 'Espera',
          'completed': 'Concluído',
        };
      
        this.todosProcessos.forEach(processo => {
          // Filtra apenas os estados relevantes e ordena por tempo
          const estadosRelevantes = processo.historicoEstados
            .filter(estado => ['ready', 'running', 'waiting', 'completed'].includes(estado.estado))
            .sort((a, b) => a.tempo - b.tempo);
      
          if (estadosRelevantes.length === 0) return;
      
          const pontosDados = [];
          let ultimoTempo = 0;
          let ultimoEstado = 'ready'; // Estado inicial padrão

          if (estadosRelevantes[0].tempo > 0) {
            pontosDados.push({ x: 0, y: niveisEstado['ready'] });
          }

          // Adiciona ponto inicial (assume que começa em pronto no tempo 0)
          pontosDados.push({
            x: 0,
            y: niveisEstado['ready']
          });
      
          // Processa cada transição de estado
          estadosRelevantes.forEach(estado => {
            // Adiciona ponto final do estado anterior
            pontosDados.push({
              x: estado.tempo,
              y: niveisEstado[ultimoEstado]
            });
            
            // Adiciona ponto inicial do novo estado
            pontosDados.push({
              x: estado.tempo,
              y: niveisEstado[estado.estado]
            });
            
            ultimoEstado = estado.estado;
            ultimoTempo = estado.tempo;
          });
      
          // Adiciona o estado atual até o tempo corrente (se não estiver completado)
          if (processo.estado === 'completed') {
            pontosDados.push({
              x: ultimoTempo,
              y: niveisEstado['completed']
            });
          } 
          else {
            pontosDados.push({
              x: this.tempoAtual,
              y: niveisEstado[processo.estado]
            });
          }
      
          datasets.push({
            label: processo.nome,
            data: pontosDados,
            borderColor: this.obterCorProcesso(processo),
            backgroundColor: this.obterCorProcesso(processo),
            borderWidth: 2,
            pointRadius: 3,
            tension: 0,
            stepped: 'after' // Faz o gráfico ter degraus nos pontos de transição
          });
        });
      
        this.graficoEstados.data.datasets = datasets;
        this.graficoEstados.update();
      }

    obterCorProcesso(processo) {
        // Se já tiver uma cor atribuída, retorna ela
        if (this.coresAtribuidas[processo.nome]) {
            return this.coresAtribuidas[processo.nome];
        }
        
        // Gera uma cor única baseada no nome/tipo do processo
        const hashString = processo.nome + processo.tipo; // Combina nome e tipo para maior unicidade
        let hash = 0;
        
        // Cria um hash simples a partir da string
        for (let i = 0; i < hashString.length; i++) {
            hash = hashString.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        // Converte o hash em uma cor HEX
        let cor = '#';
        for (let i = 0; i < 3; i++) {
            const valor = (hash >> (i * 8)) & 0xFF;
            // Ajusta para evitar cores muito claras ou muito escuras
            const valorAjustado = 80 + (valor % 120); // Range entre 80-200 para cada componente
            cor += ('00' + valorAjustado.toString(16)).substr(-2);
        }
        
        // Armazena a cor atribuída
        this.coresAtribuidas[processo.nome] = cor;
        
        return cor;
    }
    
    // Obtém as mudanças de estado de um processo para o gráfico
    obterMudancasEstadoProcesso(processo) {
      if (!processo.historicoEstados || processo.historicoEstados.length === 0) return [];
      
      const mapaEstado = {
        'ready': 'Pronto',
        'running': 'Execução',
        'waiting': 'Espera',
        'completed': 'Pronto'
      };
      
      const pontos = [];
      
      // Adiciona ponto inicial se necessário
      if (processo.historicoEstados[0].tempo > 0) {
        pontos.push({
          x: 0,
          y: mapaEstado['ready']
        });
      }
      
      // Adiciona todas as mudanças de estado
      for (const estado of processo.historicoEstados) {
        pontos.push({
          x: estado.tempo,
          y: mapaEstado[estado.estado] || estado.estado
        });
      }
      
      // Adiciona estado atual se não estiver concluído
      if (processo.estado !== 'completed') {
        pontos.push({
          x: this.tempoAtual,
          y: mapaEstado[processo.estado] || processo.estado
        });
      }
      
      return pontos;
    }
    
    // Cria um novo processo a partir dos dados do formulário
    criarProcesso() {
      const nome = document.getElementById('taskName').value;
      const tipo = document.getElementById('processType').value;
      const prioridade = document.getElementById('priority').value;
      const tempoExecucao = document.getElementById('executionTime').value;
  
      if (!nome || !tipo || !prioridade || !tempoExecucao) return;
  
      const processo = new Processo(nome, tipo, prioridade, tempoExecucao, this.tempoAtual);
      this.filaProntos.push(processo);
      this.todosProcessos.push(processo);
      
      this.registrarTransicaoEstado(processo, 'Criado', 'ready');
      this.atualizarUI();
      document.getElementById('processForm').reset();
    }
  
    iniciar() {
      if (!this.executando) {
        this.executando = true;
        this.proximoTick = Date.now(); // Reinicia o tempo ao iniciar
        this.agendarTick();
      }
    }
    
    // Pausa a simulação
    pausar() {
      this.executando = false;
      clearTimeout(this.intervalo);
    }
    
    // Reinicia toda a simulação
    reiniciar() {
      this.pausar();
      this.filaProntos = [];
      this.filaEspera = [];
      this.filaExecucao = [];
      this.todosProcessos = [];
      this.coresAtribuidas = {};
      this.tempoAtual = 0;
      this.tarefasConcluidas = 0;
      this.tempoTotalEspera = 0;
      this.transicoesEstado = [];
      this.velocidade = 1;
      this.atualizarUI();
      this.atualizarGrafico();
    }
    
    // Agenda o próximo tick da simulação
    agendarTick() {
      if (!this.executando) return;
      
      clearTimeout(this.intervalo); // Limpa timeout anterior
        
      const agora = Date.now();
      const intervaloAjustado = this.intervaloBaseTick / this.velocidade;
      
      // Calcula quando o próximo tick deve acontecer
      this.proximoTick = Math.max(agora, (this.proximoTick || agora) + intervaloAjustado);
      
      const atraso = Math.max(0, this.proximoTick - agora);
      
      this.intervalo = setTimeout(() => {
          this.tick();
          this.agendarTick();
      }, atraso);
    }

    // Executa um ciclo da simulação
    tick() {
      if (!this.executando) return;
  
      this.tempoAtual += 100;
  
      // Atualiza prioridades dos processos na fila de pronto
      this.filaProntos.forEach(processo => {
        processo.tempoEspera = this.tempoAtual - processo.tempoEntradaFila;
        processo.atualizarPrioridadeDinamica(this.tempoAtual, this.fatorEnvelhecimento);
      });
  
      // Verifica processos em espera (I/O)
      this.verificarProcessosEspera();
  
      // Escolhe próximo processo se não houver em execução
      if (this.filaExecucao.length === 0 && this.filaProntos.length > 0) {
        this.agendarProximoProcesso();
      }
  
      // Executa o processo atual
      this.executarProcessoAtual();
  
      this.atualizarUI();
      this.atualizarGrafico();
  
      // Verifica se todos os processos foram concluídos
      if (this.todosProcessos.length > 0 && this.todosProcessos.every(p => p.estado === 'completed')) {
        this.pausar();
        document.getElementById('downloadBtnPdf').style.display = 'inline-block'; // Mostra o botão de download
      }
    }
  
    // Verifica processos em espera por I/O
    verificarProcessosEspera() {
      const ioConcluidos = [];
      
      this.filaEspera.forEach((processo, indice) => {
        processo.tempoEsperaIO -= 100;
        
        if (processo.tempoEsperaIO <= 0) {
          ioConcluidos.unshift(indice); // Adiciona índices em ordem reversa para remoção segura
          processo.tempoEntradaFila = this.tempoAtual;
          processo.registrarEstado('ready', this.tempoAtual);
          this.filaProntos.push(processo);
          this.registrarTransicaoEstado(processo, 'waiting', 'ready');
        }
      });
      
      // Remove processos que completaram I/O
      ioConcluidos.forEach(indice => {
        this.filaEspera.splice(indice, 1);
      });
    }
    
    // Agenda o próximo processo para execução
    agendarProximoProcesso() {
      // Ordena por prioridade dinâmica (maior primeiro)
      this.filaProntos.sort((a, b) => {
        if (b.prioridadeDinamica !== a.prioridadeDinamica) {
          return b.prioridadeDinamica - a.prioridadeDinamica;
        }
        // Desempate pelo menor tempo de espera
        return a.tempoEspera - b.tempoEspera;
      });
  
      const proximoProcesso = this.filaProntos.shift();
      if (proximoProcesso) {
        proximoProcesso.tempoInicio = proximoProcesso.tempoInicio || this.tempoAtual;
        proximoProcesso.tempoUltimaExecucao = this.tempoAtual;
        proximoProcesso.registrarEstado('running', this.tempoAtual);
        this.filaExecucao.push(proximoProcesso);
        this.registrarTransicaoEstado(proximoProcesso, 'ready', 'running');
      }
    }
  
    // Executa o processo atual
    executarProcessoAtual() {
      if (this.filaExecucao.length === 0) return;
  
      const processoAtual = this.filaExecucao[0];
      const resultado = processoAtual.executar(100);
  
      if (resultado === 'io') {
        // Processo precisa fazer I/O
        processoAtual.tempoEsperaIO = 500 + Math.floor(Math.random() * 500); // Tempo aleatório de I/O
        processoAtual.registrarEstado('waiting', this.tempoAtual);
        this.filaEspera.push(processoAtual);
        this.filaExecucao.shift();
        this.registrarTransicaoEstado(processoAtual, 'running', 'waiting');
      } else if (resultado === 'completed') {
        // Processo concluído
        processoAtual.registrarEstado('running', this.tempoAtual - 1); 
        processoAtual.registrarEstado('completed', this.tempoAtual);
        this.tarefasConcluidas++;
        this.tempoTotalEspera += processoAtual.tempoEspera;
        this.filaExecucao.shift();
        this.registrarTransicaoEstado(processoAtual, 'running', 'completed');
      } else if (this.tempoAtual - processoAtual.tempoUltimaExecucao >= this.quantum) {
        // Quantum expirado - preempção
        processoAtual.registrarEstado('ready', this.tempoAtual);
        processoAtual.tempoEntradaFila = this.tempoAtual;
        this.filaProntos.push(processoAtual);
        this.filaExecucao.shift();
        this.registrarTransicaoEstado(processoAtual, 'running', 'ready');
      }
    }
  
    // Registra uma transição de estado
    registrarTransicaoEstado(processo, deEstado, paraEstado) {
      const mapaEstado = {
        'ready': 'Pronto',
        'running': 'Execução',
        'waiting': 'Espera',
        'completed': 'Concluído'
      };
  
      const transicao = {
        processo: (processo.nome + " - " + processo.tipo),
        de: mapaEstado[deEstado] || deEstado,
        para: mapaEstado[paraEstado] || paraEstado,
        tempo: this.tempoAtual,
        prioridade: processo.prioridadeDinamica
      };
      
      this.transicoesEstado.push(transicao);
      
      // Mantém apenas as últimas 50 transições
      if (this.transicoesEstado.length > 50) {
        this.transicoesEstado.shift();
      }
    }
  
    // Atualiza a exibição de uma fila de processos
    atualizarExibicaoFila(id, fila) {
      const container = document.querySelector(`#${id} .process-list`);
      const elementoContador = document.querySelector(`#${id} .count`);
      elementoContador.textContent = fila.length;
      
      container.innerHTML = '';
      
      fila.forEach(p => {
          const div = document.createElement('div');
          div.className = `process-item ${p.estado}`;
          
          const percentualProgresso = ((p.tempoExecucao - p.tempoRestante) / p.tempoExecucao) * 100;
          
          div.innerHTML = `
              <div class="process-info">
                  <strong>${p.nome}</strong> (${this.obterNomeTipoProcesso(p.tipo)})
                  <div class="process-details">
                      P: ${p.prioridadeDinamica} (orig ${p.prioridadeOriginal}) | 
                      R: ${p.tempoRestante}ms
                  </div>
              </div>
              <div class="progress" style="width: ${percentualProgresso}%"></div>
          `;
          
          div.addEventListener('click', (e) => {
              if (e.target.tagName !== 'BUTTON') {
                  this.pausar(); 
                  this.processoSelecionado = p;
                  document.getElementById('newPriority').value = p.prioridadeOriginal;
                  document.getElementById('priorityModal').style.display = 'block';
              }
          });
          
          container.appendChild(div);
      });
    }
  
    // Retorna o nome do tipo de processo
    obterNomeTipoProcesso(tipo) {
      const tipos = {
        'cpu': 'CPU-bound',
        'io': 'I/O-bound',
      };
      return tipos[tipo] || tipo;
    }
  
    // Atualiza a lista de transições de estado
    atualizarTransicoesEstado() {
      const container = document.getElementById('stateTransitions');
      container.innerHTML = '';
      
      // Mostra as transições mais recentes primeiro
      const transicoesRecentes = [...this.transicoesEstado].reverse();
      
      transicoesRecentes.forEach(t => {
        const div = document.createElement('div');
        div.className = 'state-transition';
        
        div.innerHTML = `
          <span class="process">${t.processo}</span>
          <span class="transition">${t.de} → ${t.para}</span>
          <span class="priority">P:${t.prioridade}</span>
          <span class="time">${t.tempo}ms</span>
        `;
        
        container.appendChild(div);
      });
    }
  
    // Atualiza toda a interface do usuário
    atualizarUI() {
      this.atualizarExibicaoFila('readyQueue', this.filaProntos);
      this.atualizarExibicaoFila('waitingQueue', this.filaEspera);
      this.atualizarExibicaoFila('executionQueue', this.filaExecucao);
      
      document.getElementById('completedTasks').textContent = this.tarefasConcluidas;
      
      const tempoEsperaMedio = this.tarefasConcluidas > 0
        ? (this.tempoTotalEspera / this.tarefasConcluidas).toFixed(2)
        : 0;
      document.getElementById('avgWaitingTime').textContent = tempoEsperaMedio;
      
      const segundosDecorridos = this.tempoAtual / 1000;
      const taxaTransferencia = segundosDecorridos > 0 ? (this.tarefasConcluidas / segundosDecorridos).toFixed(2) : 0;
      document.getElementById('throughput').textContent = taxaTransferencia;
      
      document.getElementById('simulationTime').textContent = this.tempoAtual;
      
      this.atualizarTransicoesEstado();
    }
  
    // Alterna entre modo claro e escuro
    alternarModoEscuro() {
        document.body.classList.toggle('dark-mode');
        // Atualiza o gráfico quando o modo escuro é alternado
        if (this.graficoEstados) {
          this.graficoEstados.update();
        }
      }

    // Define a velocidade da simulação
    definirVelocidade(velocidade) {
        this.velocidade = parseFloat(velocidade);
    }

    // Abre o modal para edição em massa
    abrirModalEdicaoEmMassa() {
        this.pausar(); // Pausa a simulação ao abrir o modal
        
        const modal = document.getElementById('massPriorityModal');
        const listaProcessos = document.getElementById('processListForEdit');
        listaProcessos.innerHTML = '';
        
        // Adiciona todos os processos ao modal
        this.todosProcessos.forEach(processo => {
            const item = document.createElement('div');
            item.className = 'process-edit-item';
            item.innerHTML = `
                <span>${processo.nome} (Prioridade atual: ${processo.prioridadeOriginal})</span>
                <span class="edit-icon"><i class="bi bi-pencil"></i></span>
            `;
            
            item.addEventListener('click', () => {
                this.processoSelecionado = processo;
                document.getElementById('newPriority').value = processo.prioridadeOriginal;
                document.getElementById('priorityModal').style.display = 'block';
            });
            
            listaProcessos.appendChild(item);
        });
        
        modal.style.display = 'block';
    }

    // Salva todas as prioridades após edição em massa
    salvarTodasPrioridades() {
        document.getElementById('massPriorityModal').style.display = 'none';
        this.atualizarUI();
    }
  }
  
  window.onload = () => {
    new EscalonadorPrioridadeDinamica();
  };