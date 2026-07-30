param()

$ErrorActionPreference = 'Stop'

$clients = @(
  @{ Id = '00000000-0000-0000-0000-000000000001'; FirstName = 'Alice'; LastName = 'Johnson'; Email = 'alice@example.com'; Phone = '555-0101'; Address = '123 Main St'; City = 'New York'; State = 'NY'; Zip = '10001'; Tier = 'gold' },
  @{ Id = '00000000-0000-0000-0000-000000000002'; FirstName = 'Bob'; LastName = 'Smith'; Email = 'bob@example.com'; Phone = '555-0102'; Address = '456 Oak Ave'; City = 'Los Angeles'; State = 'CA'; Zip = '90001'; Tier = 'silver' },
  @{ Id = '00000000-0000-0000-0000-000000000003'; FirstName = 'Charlie'; LastName = 'Brown'; Email = 'charlie@example.com'; Phone = '555-0103'; Address = '789 Pine Rd'; City = 'Chicago'; State = 'IL'; Zip = '60601'; Tier = 'standard' },
  @{ Id = '00000000-0000-0000-0000-000000000004'; FirstName = 'Diana'; LastName = 'Davis'; Email = 'diana@example.com'; Phone = '555-0104'; Address = '321 Elm St'; City = 'Houston'; State = 'TX'; Zip = '77001'; Tier = 'gold' },
  @{ Id = '00000000-0000-0000-0000-000000000005'; FirstName = 'Eve'; LastName = 'Wilson'; Email = 'eve@example.com'; Phone = '555-0105'; Address = '654 Maple Dr'; City = 'Phoenix'; State = 'AZ'; Zip = '85001'; Tier = 'standard' }
)

foreach ($client in $clients) {
  $body = @{
    first_name = $client.FirstName
    last_name = $client.LastName
    email = $client.Email
    phone = $client.Phone
    address_line1 = $client.Address
    city = $client.City
    state = $client.State
    zip_code = $client.Zip
    loyalty_tier = $client.Tier
  } | ConvertTo-Json -Compress

  Invoke-RestMethod -Method Put -Uri "http://localhost:3001/clients/$($client.Id)" -ContentType 'application/json' -Body $body | Out-Null
}

$orders = @(
  @{ Id = 'c8b5e4f8-3b14-4e1a-9c5d-8a7f1b9e2d3c'; ClientId = '00000000-0000-0000-0000-000000000001'; OrderTotal = 99.99 },
  @{ Id = 'd7e3f2c1-5a9b-4c8f-3e2a-1b7d9c4f8e6a'; ClientId = '00000000-0000-0000-0000-000000000002'; OrderTotal = 149.99 },
  @{ Id = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'; ClientId = '00000000-0000-0000-0000-000000000003'; OrderTotal = 79.99 },
  @{ Id = 'f4e3d2c1-b0a9-4f8e-7d6c-5b4a3f2e1d0c'; ClientId = '00000000-0000-0000-0000-000000000004'; OrderTotal = 249.99 },
  @{ Id = 'b9a8f7e6-d5c4-4b3a-2f1e-0d9c8b7a6f5e'; ClientId = '00000000-0000-0000-0000-000000000005'; OrderTotal = 199.99 }
)

foreach ($order in $orders) {
  $body = @{
    order_id = $order.Id
    client_id = $order.ClientId
    order_total = $order.OrderTotal
  } | ConvertTo-Json -Compress

  Invoke-RestMethod -Method Post -Uri 'http://localhost:3002/orders' -ContentType 'application/json' -Body $body | Out-Null
}

Write-Host 'Client seeding complete.'
Write-Host 'Clients:'
Invoke-RestMethod -Method Get -Uri 'http://localhost:3001/clients' | ConvertTo-Json -Depth 4
Write-Host 'Orders:'
Invoke-RestMethod -Method Get -Uri 'http://localhost:3002/orders' | ConvertTo-Json -Depth 4