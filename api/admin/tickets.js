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
      const token = auth.replace('Bearer ', '');
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    }

    // /api/admin/tickets - GET (ADMIN/SUPPORT only)
    if (req.path === '/api/admin/tickets' && req.method === 'GET') {
      if (decoded.role !== 'ADMIN' && decoded.role !== 'SUPPORT') return res.status(403).json({ error: 'Forbidden' });
      return res.json(await prisma.ticket.findMany({ include: { author: true, book: true, messages: true }, orderBy: { createdAt: 'desc' } }));
    }

    // /api/admin/stats - GET
    if (req.path === '/api/admin/stats' && req.method === 'GET') {
      if (decoded.role !== 'ADMIN' && decoded.role !== 'SUPPORT') return res.status(403).json({ error: 'Forbidden' });
      const totalUsers = await prisma.user.count();
      const totalBooks = await prisma.book.count();
      const totalTickets = await prisma.ticket.count();
      const openTickets = await prisma.ticket.count({ where: { status: 'Open' } });
      const resolvedTickets = await prisma.ticket.count({ where: { status: 'Resolved' } });
      return res.json({ totalUsers, totalBooks, totalTickets, openTickets, resolvedTickets });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    await prisma.$disconnect();
  }
};