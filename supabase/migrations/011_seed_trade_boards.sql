-- Seed common trade boards for major airlines and bases
-- This creates trade boards for common airline/base/role combinations

-- Delta Air Lines
INSERT INTO trade_boards (airline, base, role, is_active) VALUES
('Delta Air Lines', 'ATL', 'Flight Attendant', true),
('Delta Air Lines', 'DTW', 'Flight Attendant', true),
('Delta Air Lines', 'MSP', 'Flight Attendant', true),
('Delta Air Lines', 'SLC', 'Flight Attendant', true),
('Delta Air Lines', 'SEA', 'Flight Attendant', true),
('Delta Air Lines', 'LAX', 'Flight Attendant', true),
('Delta Air Lines', 'JFK', 'Flight Attendant', true),
('Delta Air Lines', 'ATL', 'Pilot', true),
('Delta Air Lines', 'DTW', 'Pilot', true),
('Delta Air Lines', 'MSP', 'Pilot', true);

-- United Airlines
INSERT INTO trade_boards (airline, base, role, is_active) VALUES
('United Airlines', 'ORD', 'Flight Attendant', true),
('United Airlines', 'DEN', 'Flight Attendant', true),
('United Airlines', 'IAH', 'Flight Attendant', true),
('United Airlines', 'EWR', 'Flight Attendant', true),
('United Airlines', 'SFO', 'Flight Attendant', true),
('United Airlines', 'LAX', 'Flight Attendant', true),
('United Airlines', 'ORD', 'Pilot', true),
('United Airlines', 'DEN', 'Pilot', true),
('United Airlines', 'IAH', 'Pilot', true);

-- American Airlines
INSERT INTO trade_boards (airline, base, role, is_active) VALUES
('American Airlines', 'DFW', 'Flight Attendant', true),
('American Airlines', 'ORD', 'Flight Attendant', true),
('American Airlines', 'MIA', 'Flight Attendant', true),
('American Airlines', 'PHX', 'Flight Attendant', true),
('American Airlines', 'CLT', 'Flight Attendant', true),
('American Airlines', 'LAX', 'Flight Attendant', true),
('American Airlines', 'DFW', 'Pilot', true),
('American Airlines', 'ORD', 'Pilot', true),
('American Airlines', 'MIA', 'Pilot', true);

-- Southwest Airlines
INSERT INTO trade_boards (airline, base, role, is_active) VALUES
('Southwest Airlines', 'DAL', 'Flight Attendant', true),
('Southwest Airlines', 'MDW', 'Flight Attendant', true),
('Southwest Airlines', 'BWI', 'Flight Attendant', true),
('Southwest Airlines', 'PHX', 'Flight Attendant', true),
('Southwest Airlines', 'LAS', 'Flight Attendant', true),
('Southwest Airlines', 'DAL', 'Pilot', true),
('Southwest Airlines', 'MDW', 'Pilot', true);

-- JetBlue
INSERT INTO trade_boards (airline, base, role, is_active) VALUES
('JetBlue Airways', 'JFK', 'Flight Attendant', true),
('JetBlue Airways', 'BOS', 'Flight Attendant', true),
('JetBlue Airways', 'MCO', 'Flight Attendant', true),
('JetBlue Airways', 'FLL', 'Flight Attendant', true),
('JetBlue Airways', 'JFK', 'Pilot', true),
('JetBlue Airways', 'BOS', 'Pilot', true);

-- Alaska Airlines
INSERT INTO trade_boards (airline, base, role, is_active) VALUES
('Alaska Airlines', 'SEA', 'Flight Attendant', true),
('Alaska Airlines', 'PDX', 'Flight Attendant', true),
('Alaska Airlines', 'ANC', 'Flight Attendant', true),
('Alaska Airlines', 'LAX', 'Flight Attendant', true),
('Alaska Airlines', 'SEA', 'Pilot', true),
('Alaska Airlines', 'PDX', 'Pilot', true);

-- Spirit Airlines
INSERT INTO trade_boards (airline, base, role, is_active) VALUES
('Spirit Airlines', 'FLL', 'Flight Attendant', true),
('Spirit Airlines', 'ORD', 'Flight Attendant', true),
('Spirit Airlines', 'LAS', 'Flight Attendant', true),
('Spirit Airlines', 'DFW', 'Flight Attendant', true);

-- Frontier Airlines
INSERT INTO trade_boards (airline, base, role, is_active) VALUES
('Frontier Airlines', 'DEN', 'Flight Attendant', true),
('Frontier Airlines', 'LAS', 'Flight Attendant', true),
('Frontier Airlines', 'ORD', 'Flight Attendant', true);
