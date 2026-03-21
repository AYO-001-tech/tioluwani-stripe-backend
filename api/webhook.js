const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

// Disable Vercel's default body parser so we can access the raw body
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper to read raw body from request
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let event;

  try {
    const rawBody = await getRawBody(req);
    const sig = req.headers['stripe-signature'];

    // Verify the webhook signature
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const customerEmail = session.customer_details?.email;
      const customerName = session.customer_details?.name || 'Valued Customer';
      const total = (session.amount_total / 100).toFixed(2);
      const shipping = session.shipping_details;

      let orderItems = [];
      try {
        orderItems = JSON.parse(session.metadata?.order_items || '[]');
      } catch (e) {
        orderItems = [];
      }

      const itemsList = orderItems.map(item =>
        '<tr><td style="padding:8px 12px;border-bottom:1px solid #eee">' + item.name + ' (' + item.weight + ')</td>' +
        '<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">' + item.quantity + '</td>' +
        '<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">&pound;' + (item.price * item.quantity).toFixed(2) + '</td></tr>'
      ).join('');

      const deliveryAddress = shipping ?
        (shipping.address?.line1 || '') + ', ' +
        (shipping.address?.city || '') + ', ' +
        (shipping.address?.postal_code || '') : 'Not provided';

      if (customerEmail) {
        await resend.emails.send({
          from: 'Tioluwani Food Hub <onboarding@resend.dev>',
          to: customerEmail,
          subject: 'Order Confirmed - Tioluwani Food Hub',
          html: '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff">' +
            '<div style="background:#1B5E20;padding:24px;text-align:center">' +
            '<h1 style="color:white;margin:0;font-size:22px">Tioluwani Food Hub</h1>' +
            '<p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:13px">Taste Tradition in Every Scoop</p></div>' +
            '<div style="padding:28px 24px">' +
            '<h2 style="color:#1B5E20;margin:0 0 8px">Order Confirmed! &#10004;</h2>' +
            '<p style="color:#555;line-height:1.6">Hi ' + customerName + ',</p>' +
            '<p style="color:#555;line-height:1.6">Thank you for your order! We have received your payment and your order is now being prepared.</p>' +
            '<table style="width:100%;border-collapse:collapse;margin:20px 0">' +
            '<tr style="background:#f5f5f5"><th style="padding:10px 12px;text-align:left">Item</th><th style="padding:10px 12px;text-align:center">Qty</th><th style="padding:10px 12px;text-align:right">Price</th></tr>' +
            itemsList +
            '<tr style="background:#FFF8E1"><td colspan="2" style="padding:12px;font-weight:bold">Total</td><td style="padding:12px;text-align:right;font-weight:bold;color:#E65100">&pound;' + total + '</td></tr></table>' +
            '<div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0">' +
            '<p style="margin:0 0 4px;font-weight:bold;color:#333">Delivery Address:</p>' +
            '<p style="margin:0;color:#555">' + deliveryAddress + '</p></div>' +
            '<div style="background:#FFF8E1;padding:16px;border-radius:8px;margin:16px 0">' +
            '<p style="margin:0 0 4px;font-weight:bold;color:#E65100">Estimated Delivery: 2-3 Business Days</p>' +
            '<p style="margin:0;color:#555;font-size:14px">You will receive a tracking number once your order has been dispatched.</p></div>' +
            '<p style="color:#555;line-height:1.6">If you have any questions, contact us on WhatsApp: <strong>07405850204</strong> or email: <strong>tioluwanifoodhub@gmail.com</strong></p>' +
            '</div>' +
            '<div style="background:#1a1a1a;padding:20px;text-align:center">' +
            '<p style="color:rgba(255,255,255,0.6);margin:0;font-size:12px">Tioluwani Food Hub Ltd | tioluwanifoodhub.co.uk</p></div>' +
            '</body></html>',
        });
      }

      await resend.emails.send({
        from: 'Tioluwani Orders <onboarding@resend.dev>',
        to: 'tioluwanifoodhub@gmail.com',
        subject: 'NEW ORDER - ' + customerName + ' - £' + total,
        html: '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif">' +
          '<h2 style="color:#1B5E20">New Order Received!</h2>' +
          '<p><strong>Customer:</strong> ' + customerName + '</p>' +
          '<p><strong>Email:</strong> ' + (customerEmail || 'Not provided') + '</p>' +
          '<p><strong>Total:</strong> &pound;' + total + '</p>' +
          '<p><strong>Delivery Address:</strong> ' + deliveryAddress + '</p>' +
          '<h3>Items Ordered:</h3><ul>' +
          orderItems.map(item => '<li>' + item.name + ' (' + item.weight + ') x ' + item.quantity + ' = &pound;' + (item.price * item.quantity).toFixed(2) + '</li>').join('') +
          '</ul><p>Log into Stripe Dashboard to manage this order.</p>' +
          '</body></html>',
      });
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error.message);
    res.status(200).json({ received: true });
  }
};
