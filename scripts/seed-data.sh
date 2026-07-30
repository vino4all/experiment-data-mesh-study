#!/bin/bash
# Seed initial data into the platform

set -e

echo "Waiting for services to be healthy..."
sleep 10

echo "Seeding Client domain data..."
curl -X PUT http://localhost:3001/clients/00000000-0000-0000-0000-000000000001 \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Alice","last_name":"Johnson","email":"alice@example.com","phone":"555-0101","address_line1":"123 Main St","city":"New York","state":"NY","zip_code":"10001","loyalty_tier":"gold"}'

curl -X PUT http://localhost:3001/clients/00000000-0000-0000-0000-000000000002 \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Bob","last_name":"Smith","email":"bob@example.com","phone":"555-0102","address_line1":"456 Oak Ave","city":"Los Angeles","state":"CA","zip_code":"90001","loyalty_tier":"silver"}'

curl -X PUT http://localhost:3001/clients/00000000-0000-0000-0000-000000000003 \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Charlie","last_name":"Brown","email":"charlie@example.com","phone":"555-0103","address_line1":"789 Pine Rd","city":"Chicago","state":"IL","zip_code":"60601","loyalty_tier":"standard"}'

curl -X PUT http://localhost:3001/clients/00000000-0000-0000-0000-000000000004 \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Diana","last_name":"Davis","email":"diana@example.com","phone":"555-0104","address_line1":"321 Elm St","city":"Houston","state":"TX","zip_code":"77001","loyalty_tier":"gold"}'

curl -X PUT http://localhost:3001/clients/00000000-0000-0000-0000-000000000005 \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Eve","last_name":"Wilson","email":"eve@example.com","phone":"555-0105","address_line1":"654 Maple Dr","city":"Phoenix","state":"AZ","zip_code":"85001","loyalty_tier":"standard"}'

echo ""
echo "Seeding Orders domain data..."
curl -X POST http://localhost:3002/orders \
  -H "Content-Type: application/json" \
  -d '{"order_id":"c8b5e4f8-3b14-4e1a-9c5d-8a7f1b9e2d3c","client_id":"00000000-0000-0000-0000-000000000001","order_total":99.99}'

curl -X POST http://localhost:3002/orders \
  -H "Content-Type: application/json" \
  -d '{"order_id":"d7e3f2c1-5a9b-4c8f-3e2a-1b7d9c4f8e6a","client_id":"00000000-0000-0000-0000-000000000002","order_total":149.99}'

curl -X POST http://localhost:3002/orders \
  -H "Content-Type: application/json" \
  -d '{"order_id":"a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d","client_id":"00000000-0000-0000-0000-000000000003","order_total":79.99}'

curl -X POST http://localhost:3002/orders \
  -H "Content-Type: application/json" \
  -d '{"order_id":"f4e3d2c1-b0a9-4f8e-7d6c-5b4a3f2e1d0c","client_id":"00000000-0000-0000-0000-000000000004","order_total":249.99}'

curl -X POST http://localhost:3002/orders \
  -H "Content-Type: application/json" \
  -d '{"order_id":"b9a8f7e6-d5c4-4b3a-2f1e-0d9c8b7a6f5e","client_id":"00000000-0000-0000-0000-000000000005","order_total":199.99}'

echo ""
echo "Data seeding complete!"
echo ""
echo "View results:"
echo "  Clients:  curl http://localhost:3001/clients"
echo "  Orders:   curl http://localhost:3002/orders"
