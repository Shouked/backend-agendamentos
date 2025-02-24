const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const sgMail = require('@sendgrid/mail');
const app = express();

app.use(express.json());
app.use(cors());

mongoose.connect('mongodb+srv://iagofonseca:Toldo+10@cluster0.oo8my.mongodb.net/agendamentos?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Conectado ao MongoDB!'))
.catch(err => console.log('Erro ao conectar:', err));

sgMail.setApiKey(process.env.SENDGRID_API_KEY); // Usando variável de ambiente

const agendamentoSchema = new mongoose.Schema({
  procedimento: String,
  data: String,
  horario: String,
  cliente: String,
  telefone: String,
  dataCriacao: { type: Date, default: Date.now }
});

const Agendamento = mongoose.model('Agendamento', agendamentoSchema);

app.post('/agendamentos', async (req, res) => {
  const { procedimento, data, horario, cliente, telefone } = req.body;
  const novoAgendamento = new Agendamento({ procedimento, data, horario, cliente, telefone });
  await novoAgendamento.save();

  const msg = {
    to: 'kingshowk23gmail.com', // Substitua pelo seu e-mail
    from: 'iagofonseca1992@hotmail.com', // Substitua pelo e-mail verificado
    subject: 'Novo Agendamento Criado',
    text: `Um novo agendamento foi feito!\n\nProcedimento: ${procedimento}\nData: ${data}\nHorário: ${horario}\nCliente: ${cliente}\nTelefone: ${telefone}\nCriado em: ${novoAgendamento.dataCriacao}`
  };
  console.log('Tentando enviar e-mail');
  await sgMail.send(msg);

  res.status(201).send('Agendamento criado com sucesso!');
});

app.get('/agendamentos', async (req, res) => {
  const agendamentos = await Agendamento.find();
  res.json(agendamentos);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
