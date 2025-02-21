const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

// Conexão com MongoDB Atlas
mongoose.connect('mongodb+srv://iagofonseca:Toldo+10@cluster0.oo8my.mongodb.net/agendamentos?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Conectado ao MongoDB!'))
.catch(err => console.log('Erro ao conectar:', err));

// Schema do agendamento
const agendamentoSchema = new mongoose.Schema({
  procedimento: String,
  data: String,
  horario: String,
  cliente: String,
});

const Agendamento = mongoose.model('Agendamento', agendamentoSchema);

// Rota para criar agendamento
app.post('/agendamentos', async (req, res) => {
  const { procedimento, data, horario, cliente } = req.body;
  const novoAgendamento = new Agendamento({ procedimento, data, horario, cliente });
  await novoAgendamento.save();
  res.status(201).send('Agendamento criado com sucesso!');
});

// Rota para listar agendamentos
app.get('/agendamentos', async (req, res) => {
  const agendamentos = await Agendamento.find();
  res.json(agendamentos);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));