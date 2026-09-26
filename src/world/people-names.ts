// Names for CEOs and anyone else the world invents. Genomes store indices into these lists: append only.
// Deliberately missing: surnames of well-known executives, and surnames that would spell real companies
// with an industry suffix ("Ford Motors", "Phillips Petroleum", "Hilton Hotels", "Lehman Brothers").

const w = (s: string) => s.split(' ');

export const FIRST_NAMES: readonly string[] = w(
  'James John Robert Michael William David Richard Joseph Thomas Charles Christopher Daniel Matthew Anthony Donald ' +
    'Steven Paul Andrew Joshua Kenneth Kevin Brian George Edward Ronald Timothy Jason Jeffrey Ryan Gary Nicholas Eric ' +
    'Stephen Jonathan Scott Frank Brandon Raymond Gregory Benjamin Samuel Patrick Alexander Jack Dennis Jerry Tyler ' +
    'Aaron Henry Douglas Peter Walter Harold Carl Arthur Roger Gerald Keith Lawrence Terry Sean Albert Philip Russell ' +
    'Bruce Ralph Roy Eugene Wayne Louis Howard Stanley Leonard Chester Clifford Bernard Nigel Rupert Clive Graham ' +
    'Trevor Colin Malcolm Hugh Duncan Angus Fergus Declan Liam Connor Barnaby Montgomery Chip Biff Skip Buck Chad ' +
    'Brock Trent Blake Garrett Preston Sterling Thaddeus Cornelius Ambrose Reginald Percival Ignatius ' +
    'Mary Patricia Jennifer Linda Elizabeth Barbara Susan Jessica Sarah Karen Nancy Margaret Betty Sandra Ashley ' +
    'Dorothy Kimberly Emily Donna Michelle Carol Amanda Melissa Deborah Stephanie Rebecca Laura Sharon Cynthia ' +
    'Kathleen Amy Shirley Angela Helen Anna Brenda Pamela Nicole Samantha Katherine Christine Rachel Catherine ' +
    'Carolyn Janet Ruth Maria Heather Diane Virginia Julie Joyce Victoria Kelly Christina Joan Evelyn Lauren Judith ' +
    'Olivia Martha Cheryl Megan Andrea Hannah Jacqueline Gloria Teresa Kathryn Janice Jean Alice Doris Julia Grace ' +
    'Beverly Denise Marilyn Amber Danielle Rose Diana Natalie Sophia Jane Bernadette Philippa Imogen Harriet Fiona ' +
    'Siobhan Moira Gwendolyn Penelope Priscilla Constance Beatrice Winifred Dolores Candace Tiffany Crystal Wendy ' +
    'Heidi Lars Sven Nils Bjorn Erik Anders Magnus Gunnar Olaf Ingrid Astrid Sigrid Freya Klaus Dieter Wolfgang ' +
    'Jurgen Helmut Gerhard Ulrich Friedrich Heike Petra Ute Pieter Joost Maarten Sanne Femke Henrik Mikael Kari Liv ' +
    'Johan Soren Mette Aino Timo Pekka Eero Philippe Francois Thierry Laurent Olivier Pierre Claude Sylvie Isabelle ' +
    'Nathalie Brigitte Marcel Giovanni Marco Luca Giuseppe Alessandro Francesca Giulia Chiara Paola Carlos Jose Juan ' +
    'Luis Miguel Javier Alejandro Diego Pablo Sofia Carmen Lucia Elena Isabel Joao Pedro Rafael Thiago Beatriz Ana ' +
    'Fernanda Gabriela Mariana Dmitri Sergei Ivan Vladimir Nikolai Boris Olga Natasha Svetlana Irina Tatiana Piotr ' +
    'Tomasz Katarzyna Agnieszka Pavel Jiri Zoran Goran Nikos Yannis Eleni Dimitra Mehmet Ahmet Ayse Elif Omar ' +
    'Khalid Faisal Tariq Yusuf Layla Fatima Leila Amir Reza Dariush Nasrin Hassan Kwame Kofi Chinedu Emeka ' +
    'Oluwaseun Ngozi Adaeze Amara Thabo Sipho Lindiwe Nomvula Themba Tendai Tafadzwa Wanjiru Jomo Abebe Selam ' +
    'Rajesh Vikram Anil Sanjay Rahul Arjun Ravi Suresh Priya Anjali Deepa Kavita Meera Sunita Neha Imran Farhan ' +
    'Ayesha Zainab Hiroshi Takeshi Kenji Yuki Haruto Akira Satoshi Kazuo Yoko Keiko Naoko Akiko Mei Wei Jun Lei Hao ' +
    'Ming Jian Yan Fang Minjun Jiwoo Seoyeon Hyun Sooah Minh Thanh Linh Anh Kai Leilani Mana Aroha Tane',
);

/** The first 256 can also appear in company names (name parts are 8-bit genes), so they mix every region. */
export const LAST_NAMES: readonly string[] = w(
    'Smith Williams Jones Taylor Davies Evans Thomas Roberts Wilson Moore Clark Lewis Walker Hall Young Allen King ' +
    'Wright Scott Green Baker Adams Nelson Hill Carter Mitchell Turner Parker Collins Edwards Stewart Rogers Reed ' +
    'Bailey Cooper Richardson Cox Howard Ward Watson Brooks Kelly Sanders Price Bennett Wood Barnes Ross Henderson ' +
    'Coleman Jenkins Perry Powell Patterson Butler Simmons Foster Bryant Russell Hayes Myers Hamilton Graham Sullivan ' +
    'Wallace West Cole Reynolds Fisher Ellis Harrison Gibson Marshall Chapman Dixon Palmer Mills Grant Knight ' +
    'Ferguson Stone Hawkins Dunn Perkins Hudson Spencer Pearson Holmes Watkins Carroll Duncan Hart Cunningham Bradley ' +
    'Lane Andrews Hallvard Birch Brown Johnson Martin Mueller Schmidt Schneider Fischer Weber Meyer Wagner Becker ' +
    'Schulz Hoffmann Koch Richter Wolf Braun Zimmermann Hartmann Werner Kaiser Vogel Bakker DeVries Jansen Visser ' +
    'Mulder Dekker Hansen Nielsen Pedersen Larsen Johansson Karlsson Nilsson Eriksson Lindqvist Lindgren Bergstrom ' +
    'Lund Holm Dahl Berg Solberg Virtanen Korhonen Thorsen Magnusson Bernard Dubois Durand Lefebvre Moreau Laurent ' +
    'Garnier Fontaine Rousseau Chevalier Rossi Russo Esposito Bianchi Romano Colombo Ricci Marino Greco Conti DeLuca ' +
    'Mancini Costa Giordano Lombardi Moretti Garcia Rodriguez Martinez Hernandez Lopez Gonzalez Perez Sanchez Torres ' +
    'Rivera Gomez Diaz Morales Mendoza Castillo Silva Souza Oliveira Pereira Almeida Ferreira Santos Reyes Cruz ' +
    'Haddad Khoury Nasser Karimi Yilmaz Demir Papadopoulos Petrov Ivanov Volkov Novak Kowalski Dvorak Nagy Okafor ' +
    'Okonkwo Adeyemi Mensah Owusu Boateng Kamau Mwangi Ndlovu Dlamini Moyo Banda Haile Patel Shah Sharma Gupta Singh ' +
    'Kumar Rao Reddy Mehta Kapoor Chopra Das Khan Wang Chen Zhang Liu Lin Tanaka Sato Takahashi Watanabe Yamamoto ' +
    'Nakamura Kobayashi Yamada Kim Park Choi Nguyen Tran Wong Tan' +
    'Harper Fox Riley Armstrong Carpenter Weaver Elliott Sims Peters Franklin Lawson Fields Ryan Carr Wheeler Oliver ' +
    'Montgomery Richards Williamson Banks Bishop Howell Morrison Harvey Little Burton Jacobs Reid Fuller Dean Gilbert ' +
    'Garrett Burke Day Bowman Fowler Brewer Pearce Holland Fleming Hopkins Wade Walters Curtis Neal Caldwell Lowe ' +
    'Jennings Barnett Graves Horton Shelton Barrett O\'Brien Sutton Gregory Lucas Miles Craig Chambers Holt Lambert ' +
    'Fletcher Watts Bates Hale Rhodes Beck Newman Haynes Vaughn Parks Dawson Hardy Steele Powers Barker Keller ' +
    'Chandler Leonard Walsh Lyons Ramsey Wolfe Benson Sharp Bowen Barber Cummings Baldwin Griffith Hubbard Stevenson ' +
    'Burgess Tate Cross Garner Mann Moss Thornton Farmer Glover Manning Cohen Harmon Robbins Newton Todd Blair ' +
    'Higgins Ingram Reese Cannon Townsend Potter Goodwin Rowe Hampton Patton Swanson Francis Goodman Yates Hodges ' +
    'Webster Norman Malone Hammond Cobb Quinn Blake Maxwell Floyd Osborne McCarthy Gibbs Doyle Sherman Saunders ' +
    'Fitzgerald Stokes Pratt Briggs Parsons McLaughlin Buchanan Copeland Brady McCormick Holloway Poole Logan Owen ' +
    'Marsh Drake Morton Sparks Norton Clayton Carson Barton Harrington Casey Boone Clarke Wilkins Underwood Hogan ' +
    'McKenzie Collier Nash Summers Atkins Fairbanks Whitmore Ashby Pemberton Worthington Ellsworth Thackeray ' +
    'Schroeder Neumann Krueger Lange Krause Smit Meijer DeBoer Bos Vos Haugen Nieminen Makinen Gunnarsson Leroy ' +
    'Michel Bruno Gallo Rizzo Ramirez Flores Ortiz Gutierrez Ruiz Alvarez Jimenez Moreno Romero Herrera Medina ' +
    'Aguilar Vargas Castro Carvalho Ribeiro Rocha Bautista Farouk Rahimi Tehrani Hosseini Kaya Ozturk Georgiou ' +
    'Nikolaidis Smirnov Sokolov Popov Kuznetsov Horvat Nowak Wisniewski Svoboda Horvath Kovacs Popescu Ionescu ' +
    'Dimitrov Nwosu Eze Obi Asante Otieno Njoroge Nkosi Khumalo Mutasa Chikore Phiri Tembo Tesfaye Bekele Diallo ' +
    'Traore Diop Iyer Menon Nair Desai Joshi Malhotra Bose Banerjee Chatterjee Mukherjee Ahmed Hussain Qureshi ' +
    'Siddiqui Chaudhry Pillai Kulkarni Li Yang Zhao Wu Zhou Xu Sun Zhu Gao He Guo Luo Ito Kato Yoshida Sasaki Inoue ' +
    'Kimura Hayashi Shimizu Mori Jung Kang Cho Yoon Jang Lim Pham Hoang Vu Dang Ng Chan Leung Lau Cheung Goh Ong Teo ' +
    'Kealoha Kahale Ngata Parata',
);
