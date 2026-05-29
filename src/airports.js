// Top ~150 airports worldwide by passenger traffic.
// For production: replace with full OurAirports CSV (~80k airports, public domain).
// Format: [IATA, name, city, country, lat, lon]

export const AIRPORTS = [
  ['ATL', 'Hartsfield-Jackson Atlanta International', 'Atlanta', 'US', 33.6407, -84.4277],
  ['DFW', 'Dallas/Fort Worth International', 'Dallas', 'US', 32.8998, -97.0403],
  ['DEN', 'Denver International', 'Denver', 'US', 39.8561, -104.6737],
  ['ORD', "O'Hare International", 'Chicago', 'US', 41.9742, -87.9073],
  ['LAX', 'Los Angeles International', 'Los Angeles', 'US', 33.9416, -118.4085],
  ['JFK', 'John F. Kennedy International', 'New York', 'US', 40.6413, -73.7781],
  ['LAS', 'Harry Reid International', 'Las Vegas', 'US', 36.084, -115.1537],
  ['MCO', 'Orlando International', 'Orlando', 'US', 28.4312, -81.3081],
  ['CLT', 'Charlotte Douglas International', 'Charlotte', 'US', 35.214, -80.9431],
  ['MIA', 'Miami International', 'Miami', 'US', 25.7959, -80.287],
  ['SEA', 'Seattle-Tacoma International', 'Seattle', 'US', 47.4502, -122.3088],
  ['PHX', 'Phoenix Sky Harbor International', 'Phoenix', 'US', 33.4373, -112.0078],
  ['EWR', 'Newark Liberty International', 'Newark', 'US', 40.6895, -74.1745],
  ['SFO', 'San Francisco International', 'San Francisco', 'US', 37.6213, -122.379],
  ['IAH', 'George Bush Intercontinental', 'Houston', 'US', 29.9902, -95.3368],
  ['BOS', 'Logan International', 'Boston', 'US', 42.3656, -71.0096],
  ['MSP', 'Minneapolis-Saint Paul International', 'Minneapolis', 'US', 44.882, -93.2218],
  ['LGA', 'LaGuardia', 'New York', 'US', 40.7769, -73.874],
  ['DTW', 'Detroit Metropolitan', 'Detroit', 'US', 42.2124, -83.3534],
  ['PHL', 'Philadelphia International', 'Philadelphia', 'US', 39.8744, -75.2424],
  ['SLC', 'Salt Lake City International', 'Salt Lake City', 'US', 40.7899, -111.9791],
  ['BWI', 'Baltimore/Washington International', 'Baltimore', 'US', 39.1754, -76.6683],
  ['DCA', 'Ronald Reagan Washington National', 'Washington', 'US', 38.8512, -77.0402],
  ['IAD', 'Washington Dulles International', 'Washington', 'US', 38.9531, -77.4565],
  ['SAN', 'San Diego International', 'San Diego', 'US', 32.7338, -117.1933],
  ['MDW', 'Chicago Midway', 'Chicago', 'US', 41.7868, -87.7522],
  ['TPA', 'Tampa International', 'Tampa', 'US', 27.9755, -82.5332],
  ['PDX', 'Portland International', 'Portland', 'US', 45.5898, -122.5951],
  ['HNL', 'Daniel K. Inouye International', 'Honolulu', 'US', 21.3245, -157.9251],
  ['AUS', 'Austin-Bergstrom International', 'Austin', 'US', 30.1975, -97.6664],
  ['STL', 'St. Louis Lambert International', 'St. Louis', 'US', 38.7487, -90.37],
  ['BNA', 'Nashville International', 'Nashville', 'US', 36.1245, -86.6782],
  ['RDU', 'Raleigh-Durham International', 'Raleigh', 'US', 35.8776, -78.7875],
  ['MSY', 'Louis Armstrong New Orleans International', 'New Orleans', 'US', 29.9934, -90.258],
  ['SJC', 'San Jose International', 'San Jose', 'US', 37.3626, -121.929],
  ['SMF', 'Sacramento International', 'Sacramento', 'US', 38.6954, -121.5908],
  ['OAK', 'Oakland International', 'Oakland', 'US', 37.7126, -122.2197],
  ['CLE', 'Cleveland Hopkins International', 'Cleveland', 'US', 41.4117, -81.8498],
  ['IND', 'Indianapolis International', 'Indianapolis', 'US', 39.7173, -86.2944],
  ['CMH', 'John Glenn Columbus International', 'Columbus', 'US', 39.998, -82.8919],
  ['PIT', 'Pittsburgh International', 'Pittsburgh', 'US', 40.4915, -80.2329],
  ['ANC', 'Ted Stevens Anchorage International', 'Anchorage', 'US', 61.1744, -149.9961],
  ['YYZ', 'Toronto Pearson International', 'Toronto', 'CA', 43.6777, -79.6248],
  ['YVR', 'Vancouver International', 'Vancouver', 'CA', 49.1939, -123.1844],
  ['YUL', 'Montreal-Trudeau International', 'Montreal', 'CA', 45.4706, -73.7408],
  ['YYC', 'Calgary International', 'Calgary', 'CA', 51.1215, -114.0076],
  ['YEG', 'Edmonton International', 'Edmonton', 'CA', 53.3097, -113.5801],
  ['YOW', 'Ottawa Macdonald-Cartier International', 'Ottawa', 'CA', 45.3225, -75.6692],
  ['YHZ', 'Halifax Stanfield International', 'Halifax', 'CA', 44.881, -63.5086],
  ['MEX', 'Mexico City International', 'Mexico City', 'MX', 19.4361, -99.0719],
  ['CUN', 'Cancun International', 'Cancun', 'MX', 21.0365, -86.8771],
  ['LHR', 'Heathrow', 'London', 'GB', 51.4694, -0.4502],
  ['LGW', 'Gatwick', 'London', 'GB', 51.1481, -0.1903],
  ['STN', 'Stansted', 'London', 'GB', 51.885, 0.235],
  ['MAN', 'Manchester', 'Manchester', 'GB', 53.3537, -2.275],
  ['EDI', 'Edinburgh', 'Edinburgh', 'GB', 55.95, -3.3725],
  ['DUB', 'Dublin', 'Dublin', 'IE', 53.4213, -6.2701],
  ['CDG', 'Charles de Gaulle', 'Paris', 'FR', 49.0097, 2.5479],
  ['ORY', 'Orly', 'Paris', 'FR', 48.7233, 2.3794],
  ['NCE', 'Nice Cote d Azur', 'Nice', 'FR', 43.6584, 7.2159],
  ['AMS', 'Schiphol', 'Amsterdam', 'NL', 52.3105, 4.7683],
  ['FRA', 'Frankfurt', 'Frankfurt', 'DE', 50.0379, 8.5622],
  ['MUC', 'Munich', 'Munich', 'DE', 48.3537, 11.775],
  ['BER', 'Berlin Brandenburg', 'Berlin', 'DE', 52.3667, 13.5033],
  ['DUS', 'Dusseldorf', 'Dusseldorf', 'DE', 51.2895, 6.7668],
  ['HAM', 'Hamburg', 'Hamburg', 'DE', 53.6304, 9.9882],
  ['MAD', 'Madrid-Barajas', 'Madrid', 'ES', 40.4839, -3.5681],
  ['BCN', 'Barcelona-El Prat', 'Barcelona', 'ES', 41.2974, 2.0833],
  ['PMI', 'Palma de Mallorca', 'Palma', 'ES', 39.5517, 2.7388],
  ['LIS', 'Lisbon', 'Lisbon', 'PT', 38.7813, -9.1359],
  ['FCO', 'Leonardo da Vinci-Fiumicino', 'Rome', 'IT', 41.8003, 12.2389],
  ['MXP', 'Malpensa', 'Milan', 'IT', 45.6306, 8.7281],
  ['LIN', 'Linate', 'Milan', 'IT', 45.4451, 9.2767],
  ['VCE', 'Venice Marco Polo', 'Venice', 'IT', 45.5053, 12.3519],
  ['ZRH', 'Zurich', 'Zurich', 'CH', 47.4647, 8.5492],
  ['GVA', 'Geneva', 'Geneva', 'CH', 46.2381, 6.1089],
  ['VIE', 'Vienna International', 'Vienna', 'AT', 48.1103, 16.5697],
  ['BRU', 'Brussels', 'Brussels', 'BE', 50.9014, 4.4844],
  ['CPH', 'Copenhagen', 'Copenhagen', 'DK', 55.6181, 12.6561],
  ['ARN', 'Stockholm Arlanda', 'Stockholm', 'SE', 59.6519, 17.9186],
  ['OSL', 'Oslo Gardermoen', 'Oslo', 'NO', 60.1939, 11.1004],
  ['HEL', 'Helsinki-Vantaa', 'Helsinki', 'FI', 60.3172, 24.9633],
  ['KEF', 'Keflavik International', 'Reykjavik', 'IS', 63.985, -22.6056],
  ['WAW', 'Warsaw Chopin', 'Warsaw', 'PL', 52.1657, 20.9671],
  ['PRG', 'Prague Vaclav Havel', 'Prague', 'CZ', 50.1008, 14.26],
  ['BUD', 'Budapest Ferenc Liszt International', 'Budapest', 'HU', 47.4369, 19.2556],
  ['ATH', 'Athens International', 'Athens', 'GR', 37.9364, 23.9445],
  ['IST', 'Istanbul Airport', 'Istanbul', 'TR', 41.2753, 28.7519],
  ['SAW', 'Sabiha Gokcen', 'Istanbul', 'TR', 40.8986, 29.3092],
  ['SVO', 'Sheremetyevo', 'Moscow', 'RU', 55.9728, 37.4146],
  ['DME', 'Domodedovo', 'Moscow', 'RU', 55.4088, 37.9063],
  ['DXB', 'Dubai International', 'Dubai', 'AE', 25.2528, 55.3644],
  ['DWC', 'Al Maktoum International', 'Dubai', 'AE', 24.8967, 55.1614],
  ['AUH', 'Abu Dhabi International', 'Abu Dhabi', 'AE', 24.433, 54.6511],
  ['DOH', 'Hamad International', 'Doha', 'QA', 25.2731, 51.6086],
  ['RUH', 'King Khalid International', 'Riyadh', 'SA', 24.9576, 46.6988],
  ['JED', 'King Abdulaziz International', 'Jeddah', 'SA', 21.6796, 39.1565],
  ['TLV', 'Ben Gurion', 'Tel Aviv', 'IL', 32.0114, 34.8867],
  ['CAI', 'Cairo International', 'Cairo', 'EG', 30.1219, 31.4056],
  ['JNB', 'O.R. Tambo International', 'Johannesburg', 'ZA', -26.1392, 28.246],
  ['CPT', 'Cape Town International', 'Cape Town', 'ZA', -33.9648, 18.6017],
  ['NBO', 'Jomo Kenyatta International', 'Nairobi', 'KE', -1.3192, 36.9278],
  ['ADD', 'Addis Ababa Bole', 'Addis Ababa', 'ET', 8.9778, 38.7993],
  ['LOS', 'Murtala Muhammed International', 'Lagos', 'NG', 6.5774, 3.3211],
  ['CMN', 'Mohammed V International', 'Casablanca', 'MA', 33.3675, -7.5898],
  ['DEL', 'Indira Gandhi International', 'Delhi', 'IN', 28.5562, 77.1],
  ['BOM', 'Chhatrapati Shivaji Maharaj International', 'Mumbai', 'IN', 19.0896, 72.8656],
  ['BLR', 'Kempegowda International', 'Bangalore', 'IN', 13.1986, 77.7066],
  ['MAA', 'Chennai International', 'Chennai', 'IN', 12.9941, 80.1709],
  ['HYD', 'Rajiv Gandhi International', 'Hyderabad', 'IN', 17.2403, 78.4294],
  ['CCU', 'Netaji Subhas Chandra Bose International', 'Kolkata', 'IN', 22.6547, 88.4467],
  ['KTM', 'Tribhuvan International', 'Kathmandu', 'NP', 27.6966, 85.3591],
  ['BKK', 'Suvarnabhumi', 'Bangkok', 'TH', 13.69, 100.7501],
  ['DMK', 'Don Mueang International', 'Bangkok', 'TH', 13.9126, 100.6068],
  ['HKT', 'Phuket International', 'Phuket', 'TH', 8.1132, 98.3169],
  ['SIN', 'Singapore Changi', 'Singapore', 'SG', 1.3644, 103.9915],
  ['KUL', 'Kuala Lumpur International', 'Kuala Lumpur', 'MY', 2.7456, 101.7099],
  ['CGK', 'Soekarno-Hatta International', 'Jakarta', 'ID', -6.1256, 106.6559],
  ['DPS', 'Ngurah Rai International', 'Denpasar (Bali)', 'ID', -8.7482, 115.1672],
  ['MNL', 'Ninoy Aquino International', 'Manila', 'PH', 14.5086, 121.0194],
  ['SGN', 'Tan Son Nhat International', 'Ho Chi Minh City', 'VN', 10.8188, 106.652],
  ['HAN', 'Noi Bai International', 'Hanoi', 'VN', 21.2212, 105.8073],
  ['HKG', 'Hong Kong International', 'Hong Kong', 'HK', 22.308, 113.9185],
  ['TPE', 'Taiwan Taoyuan International', 'Taipei', 'TW', 25.0777, 121.2328],
  ['PEK', 'Beijing Capital International', 'Beijing', 'CN', 40.0799, 116.6031],
  ['PKX', 'Beijing Daxing International', 'Beijing', 'CN', 39.5098, 116.4106],
  ['PVG', 'Shanghai Pudong International', 'Shanghai', 'CN', 31.1443, 121.8083],
  ['SHA', 'Shanghai Hongqiao International', 'Shanghai', 'CN', 31.1979, 121.3364],
  ['CAN', 'Guangzhou Baiyun International', 'Guangzhou', 'CN', 23.3924, 113.2988],
  ['SZX', 'Shenzhen Bao an International', 'Shenzhen', 'CN', 22.6393, 113.8108],
  ['CTU', 'Chengdu Shuangliu International', 'Chengdu', 'CN', 30.5785, 103.9471],
  ['NRT', 'Narita International', 'Tokyo', 'JP', 35.772, 140.3929],
  ['HND', 'Tokyo Haneda', 'Tokyo', 'JP', 35.5494, 139.7798],
  ['KIX', 'Kansai International', 'Osaka', 'JP', 34.4347, 135.2331],
  ['ITM', 'Osaka International (Itami)', 'Osaka', 'JP', 34.7855, 135.4382],
  ['NGO', 'Chubu Centrair International', 'Nagoya', 'JP', 34.8584, 136.8054],
  ['CTS', 'New Chitose', 'Sapporo', 'JP', 42.7752, 141.6923],
  ['FUK', 'Fukuoka', 'Fukuoka', 'JP', 33.586, 130.451],
  ['ICN', 'Incheon International', 'Seoul', 'KR', 37.4602, 126.4407],
  ['GMP', 'Gimpo International', 'Seoul', 'KR', 37.5583, 126.7906],
  ['SYD', 'Kingsford Smith', 'Sydney', 'AU', -33.9399, 151.1753],
  ['MEL', 'Melbourne', 'Melbourne', 'AU', -37.669, 144.8410],
  ['BNE', 'Brisbane', 'Brisbane', 'AU', -27.3942, 153.1218],
  ['PER', 'Perth', 'Perth', 'AU', -31.9403, 115.9669],
  ['ADL', 'Adelaide', 'Adelaide', 'AU', -34.945, 138.5306],
  ['AKL', 'Auckland', 'Auckland', 'NZ', -37.0082, 174.785],
  ['CHC', 'Christchurch', 'Christchurch', 'NZ', -43.4894, 172.5322],
  ['WLG', 'Wellington', 'Wellington', 'NZ', -41.3272, 174.8053],
  ['GRU', 'Sao Paulo-Guarulhos International', 'Sao Paulo', 'BR', -23.4356, -46.4731],
  ['GIG', 'Rio de Janeiro-Galeao', 'Rio de Janeiro', 'BR', -22.81, -43.2506],
  ['EZE', 'Ministro Pistarini International', 'Buenos Aires', 'AR', -34.8222, -58.5358],
  ['SCL', 'Arturo Merino Benitez International', 'Santiago', 'CL', -33.393, -70.7858],
  ['LIM', 'Jorge Chavez International', 'Lima', 'PE', -12.0219, -77.1143],
  ['BOG', 'El Dorado International', 'Bogota', 'CO', 4.7016, -74.1469],
  ['UIO', 'Mariscal Sucre International', 'Quito', 'EC', -0.1292, -78.3575],
  ['PTY', 'Tocumen International', 'Panama City', 'PA', 9.0714, -79.3835],
];

/**
 * Search airports by IATA code, city, or name (case-insensitive).
 * Prioritizes IATA exact match, then prefix matches, then substring matches.
 */
export function searchAirports(query, limit = 8) {
  if (!query || query.length === 0) return [];
  const q = query.toLowerCase().trim();

  const results = [];
  const seen = new Set();

  for (const ap of AIRPORTS) {
    const [iata, name, city, country] = ap;
    const iataL = iata.toLowerCase();
    const cityL = city.toLowerCase();
    const nameL = name.toLowerCase();

    let score = 0;
    if (iataL === q) score = 100;
    else if (iataL.startsWith(q)) score = 90;
    else if (cityL === q) score = 85;
    else if (cityL.startsWith(q)) score = 70;
    else if (nameL.startsWith(q)) score = 50;
    else if (cityL.includes(q)) score = 40;
    else if (nameL.includes(q)) score = 30;
    else if (iataL.includes(q)) score = 20;

    if (score > 0 && !seen.has(iata)) {
      seen.add(iata);
      results.push({ iata, name, city, country, lat: ap[4], lon: ap[5], score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

export function findByIata(iata) {
  const code = iata.toUpperCase();
  const found = AIRPORTS.find(ap => ap[0] === code);
  if (!found) return null;
  return { iata: found[0], name: found[1], city: found[2], country: found[3], lat: found[4], lon: found[5] };
}
