const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { items, delivery } = req.body;

    // Build line items for Stripe
    const line_items = items.map(item => ({
      price_data: {
        currency: 'gbp',
        product_data: {
          name: item.name + ' (' + item.weight + ')',
        },
        unit_amount: Math.round(item.price * 100), // Stripe uses pence
      },
      quantity: item.quantity,
    }));

    // Add delivery fee if present
    if (delivery && delivery.amount > 0) {
      line_items.push({
        price_data: {
          currency: 'gbp',
          product_data: {
            name: 'UK Delivery',
          },
          unit_amount: Math.round(delivery.amount * 100),
        },
        quantity: 1,
      });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: line_items,
      mode: 'payment',
      success_url: req.body.success_url || 'https://tioluwanifoodhub.co.uk?payment=success',
      cancel_url: req.body.cancel_url || 'https://tioluwanifoodhub.co.uk?payment=cancelled',
      shipping_address_collection: {
        allowed_countries: ['GB'],
      },
    });

    res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: error.message });
  }
};
