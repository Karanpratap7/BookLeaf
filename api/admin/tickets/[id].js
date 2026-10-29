const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const prisma = new PrismaClient();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const auth = req.headers.authorization;
    let decoded;
    if (auth && auth.startsWith('Bearer ')) {
      decoded = jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET || 'secret');
    }

    // /api/admin/tickets/:id - GET (ADMIN/SUPPORT only)
    if (req.path.match(/^\/api\/admin\/tickets\/[^\/]+$/) && req.method === 'GET') {
      if (decoded.role !== 'ADMIN' && decoded.role !== 'SUPPORT') return res.status(403).json({ error: 'Forbidden' });
      const ticketId = req.path.split('/').pop();
      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { author: true, book: true, messages: true } });
      if (!ticket) return res.status(404).json({ error: 'Not found' });
      return res.json(ticket);
    }

    // /api/admin/tickets/:id/PATCH - update ticket
    if (req.path.match(/^\/api\/admin\/tickets\/[^\/]+\/PATCH$/i) || (req.path.match(/^\/api\/admin\/tickets\/[^\/]+$/) && req.method === 'PATCH')) {
      if (decoded.role !== 'ADMIN' && decoded.role !== 'SUPPORT') return res.status(403).json({ error: 'Forbidden' });
      const ticketId = req.path.split('/').pop();
      const { status, categoryOverride, priorityOverride } = req.body;
      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
      if (!ticket) return res.status(404).json({ error: 'Not found' });
      const updateData = {};
      if (status) updateData.status = status;
      if (categoryOverride) updateData.category = categoryOverride;
      if (priorityOverride) updateData.priority = priorityOverride;
      const updated = await prisma.ticket.update({ where: { id: ticketId }, data: updateData });
      return res.json(updated);
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    await prisma.$disconnect();
  }
};