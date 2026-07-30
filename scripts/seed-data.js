const CLIENT_SERVICE_URL = process.env.CLIENT_SERVICE_URL || 'http://127.0.0.1:3001';
const ORDERS_SERVICE_URL = process.env.ORDERS_SERVICE_URL || 'http://127.0.0.1:3002';

const clients = [
  ['00000000-0000-0000-0000-000000000001', 'Alice', 'Johnson', 'alice@example.com', '555-0101', '123 Main St', 'New York', 'NY', '10001', 'gold'],
  ['00000000-0000-0000-0000-000000000002', 'Bob', 'Smith', 'bob@example.com', '555-0102', '456 Oak Ave', 'Los Angeles', 'CA', '90001', 'silver'],
  ['00000000-0000-0000-0000-000000000003', 'Charlie', 'Brown', 'charlie@example.com', '555-0103', '789 Pine Rd', 'Chicago', 'IL', '60601', 'standard'],
  ['00000000-0000-0000-0000-000000000004', 'Diana', 'Davis', 'diana@example.com', '555-0104', '321 Elm St', 'Houston', 'TX', '77001', 'gold'],
  ['00000000-0000-0000-0000-000000000005', 'Eve', 'Wilson', 'eve@example.com', '555-0105', '654 Maple Dr', 'Phoenix', 'AZ', '85001', 'standard'],
];

const orders = [
  ['c8b5e4f8-3b14-4e1a-9c5d-8a7f1b9e2d3c', clients[0][0], 99.99],
  ['d7e3f2c1-5a9b-4c8f-3e2a-1b7d9c4f8e6a', clients[1][0], 149.99],
  ['a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', clients[2][0], 79.99],
  ['f4e3d2c1-b0a9-4f8e-7d6c-5b4a3f2e1d0c', clients[3][0], 249.99],
  ['b9a8f7e6-d5c4-4b3a-2f1e-0d9c8b7a6f5e', clients[4][0], 199.99],
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${url} failed with status ${response.status}`);
  }

  return response.json();
}

async function waitForHealth(url) {
  let lastError;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await request(url);
      return;
    } catch (error) {
      lastError = error;
      await sleep(1000);
    }
  }
  throw lastError;
}

async function main() {
  await Promise.all([
    waitForHealth(`${CLIENT_SERVICE_URL}/health`),
    waitForHealth(`${ORDERS_SERVICE_URL}/health`),
  ]);

  for (const [id, firstName, lastName, email, phone, address, city, state, zip, tier] of clients) {
    await request(`${CLIENT_SERVICE_URL}/clients/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        address_line1: address,
        city,
        state,
        zip_code: zip,
        loyalty_tier: tier,
      }),
    });
  }

  for (const [orderId, clientId, orderTotal] of orders) {
    await request(`${ORDERS_SERVICE_URL}/orders`, {
      method: 'POST',
      body: JSON.stringify({
        order_id: orderId,
        client_id: clientId,
        order_total: orderTotal,
      }),
    });
  }

  console.log(`Seeded ${clients.length} synthetic clients and ${orders.length} synthetic orders.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

