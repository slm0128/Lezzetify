const communityRecipes = [
    {
        id: 'lezzetify-menemen',
        title: 'Menemen',
        category: 'Vegetarisch & Klassisch',
        description: 'Saftiges Rührei mit frischen Tomaten, grünen Spitzpaprika, Olivenöl und Kräutern.',
        image: 'images/menemen.jpg',
        prepTime: 25,
        servings: 2,
        ingredients: [
            '4 Eier',
            '3 reife Tomaten',
            '2 grüne Spitzpaprika (Sivri Biber)',
            '1 kleine Zwiebel (optional)',
            '2 EL Olivenöl oder Butter',
            '1 TL Pul Biber (türkische Chiliflocken)',
            'Salz und schwarzer Pfeffer',
            'Frische Petersilie zum Garnieren'
        ],
        instructions: [
            'Zwiebel fein würfeln, Spitzpaprika entkernen und in Ringe schneiden. Tomaten häuten (optional) und würfeln.',
            'Olivenöl in einer Pfanne erhitzen. Zwiebeln und Paprika bei mittlerer Hitze etwa 5 Minuten glasig anbraten.',
            'Tomaten hinzugeben, mit Salz, Pfeffer und Pul Biber würzen und etwa 10 Minuten einköcheln lassen.',
            'Eier über der Soße aufschlagen. Das Eiweiß leicht unterrühren und das Eigelb nach Wunsch ganz lassen oder anstechen.',
            'Bei geschlossener Pfanne 2–3 Minuten stocken lassen. Mit Petersilie bestreuen und servieren.'
        ],
        nutritionIngredients: []
    },
    {
        id: 'lezzetify-mercimek-corbasi',
        title: 'Mercimek Çorbası',
        category: 'Proteinreich',
        description: 'Traditionelle türkische Linsensuppe mit roten Linsen, Gemüse und ausgewählten Gewürzen.',
        image: 'images/mercimek corbasi.jpg',
        prepTime: 40,
        servings: 4,
        ingredients: [
            '1 Tasse rote Linsen',
            '1 Zwiebel',
            '1 Karotte',
            '1 Kartoffel',
            '1 EL Tomatenmark oder Paprikamark',
            '1,5 Liter Gemüsebrühe oder Wasser',
            '2 EL Butter',
            '1 EL getrocknete Minze',
            '1 TL Paprikapulver (edelsüß)',
            'Salz und Pfeffer',
            'Zitronenspalten zum Servieren'
        ],
        instructions: [
            'Rote Linsen gründlich waschen. Zwiebel, Karotte und Kartoffel schälen und grob würfeln.',
            '1 EL Butter in einem großen Topf schmelzen und das Gemüse kurz andünsten. Tomatenmark hinzugeben und 1 Minute mitrösten.',
            'Linsen und Gemüsebrühe hinzufügen und bei mittlerer Hitze etwa 20–25 Minuten köcheln lassen, bis alles weich ist.',
            'Die Suppe mit einem Pürierstab fein pürieren und mit Salz und Pfeffer abschmecken.',
            'Die restliche Butter in einer kleinen Pfanne schmelzen. Minze und Paprikapulver kurz darin aufschäumen lassen.',
            'Minz-Butter über die Suppe träufeln und mit Zitrone servieren.'
        ],
        nutritionIngredients: []
    },
    {
        id: 'lezzetify-coban-salatasi',
        title: 'Çoban Salatası',
        category: 'Schnell & Leicht',
        description: 'Frischer Salat aus Tomaten, Gurken und Paprika mit Olivenöl, Zitrone und Petersilie.',
        image: 'images/coban salatasi.jpg',
        prepTime: 10,
        servings: 3,
        ingredients: [
            '4 feste Tomaten',
            '2 kleine Snackgurken oder 1/2 Salatgurke',
            '1 grüne Spitzpaprika',
            '1 rote Zwiebel',
            '1/2 Bund glatte Petersilie',
            '4 EL Olivenöl',
            'Saft einer 1/2 Zitrone',
            '1 EL Granatapfelsirup (Nar Ekşisi, optional)',
            'Salz'
        ],
        instructions: [
            'Tomaten, Gurken und Paprika waschen und in feine, gleichmäßige Würfel schneiden.',
            'Rote Zwiebel schälen und fein würfeln. Petersilie fein hacken.',
            'Alle geschnittenen Zutaten in eine große Schüssel geben und vorsichtig vermengen.',
            'Aus Olivenöl, Zitronensaft, Granatapfelsirup und Salz ein Dressing anrühren.',
            'Das Dressing unter den Salat mischen und vor dem Servieren 5 Minuten ziehen lassen.'
        ],
        nutritionIngredients: []
    },
    {
        id: 'lezzetify-pelmeni',
        title: 'Pelmeni',
        category: 'Hausgemacht & Beliebt',
        description: 'Russische Teigtaschen mit gewürzter Hackfleischfüllung, Butter, Schmand und Dill.',
        image: 'images/pelmeni.png',
        prepTime: 60,
        servings: 4,
        ingredients: [
            '300 g Weizenmehl',
            '1 Ei',
            '100 ml Wasser',
            '1 Prise Salz',
            '300 g gemischtes Hackfleisch (halb Rind, halb Schwein)',
            '1 kleine Zwiebel',
            'Salz und schwarzer Pfeffer',
            'Butter zum Servieren',
            'Schmand (Smetana) zum Servieren',
            'Frischer Dill zum Servieren'
        ],
        instructions: [
            'Mehl, Ei, Wasser und Salz zu einem glatten Teig kneten. Abdecken und 30 Minuten ruhen lassen.',
            'Zwiebel fein reiben und mit dem Hackfleisch vermengen. Kräftig mit Salz und Pfeffer würzen.',
            'Teig auf einer bemehlten Fläche etwa 1–2 mm dünn ausrollen und Kreise von etwa 5 cm ausstechen.',
            'Je einen halben Teelöffel Füllung auf einen Kreis geben, halbmondförmig zusammenklappen und die Ränder festdrücken. Die Enden zusammenführen.',
            'Pelmeni in reichlich Salzwasser kochen. Sobald sie an die Oberfläche steigen, noch 3–4 Minuten ziehen lassen.',
            'Herausheben und mit Butter, Schmand und gehacktem Dill servieren.'
        ],
        nutritionIngredients: []
    },
    {
        id: 'lezzetify-syrniki',
        title: 'Syrniki',
        category: 'Süß',
        description: 'Russische Quarkpfannkuchen mit Puderzucker, saurer Sahne, Marmelade oder Beeren.',
        image: 'images/syrniki.png',
        prepTime: 25,
        servings: 9,
        ingredients: [
            '350 g Tvorog oder gut abgetropfter Magerquark',
            '1 Ei',
            '2 EL Zucker',
            '1 Päckchen Vanillezucker',
            '3 EL Mehl (plus etwas zum Wenden)',
            '1 Prise Salz',
            'Pflanzenöl zum Braten',
            'Puderzucker zum Servieren',
            'Saure Sahne, Marmelade oder frische Beeren zum Servieren'
        ],
        instructions: [
            'Tvorog oder Quark bei Bedarf durch ein Tuch pressen und in einer Schüssel mit einer Gabel zerdrücken.',
            'Ei, Zucker, Vanillezucker und Salz hinzufügen und gut verrühren.',
            'Mehl unterheben, bis eine klebrige, aber formbare Masse entsteht.',
            'Mit nassen Händen kleine Bällchen formen, in Mehl wenden und zu etwa 1,5 cm dicken Talern flach drücken.',
            'Etwas Öl bei mittlerer Hitze erhitzen und Syrniki von beiden Seiten jeweils 4–5 Minuten goldbraun braten.',
            'Auf Küchenpapier abtropfen lassen und warm mit Puderzucker und einer Beilage servieren.'
        ],
        nutritionIngredients: []
    },
    {
        id: 'lezzetify-wiener-schnitzel',
        title: 'Wiener Schnitzel vom Kalb',
        category: 'Klassisch & Knusprig',
        description: 'Zartes Kalbsschnitzel in knuspriger Panade mit Zitrone und Petersilienkartoffeln.',
        image: 'images/schnitzel.png',
        prepTime: 40,
        servings: 2,
        ingredients: [
            '2 Kalbsschnitzel (je ca. 150 g)',
            '2 Eier',
            '4 EL griffiges Mehl',
            '150 g Paniermehl (Semmelbrösel)',
            '200 g Butterschmalz zum Ausbacken',
            'Salz',
            '1 Zitrone in Spalten'
        ],
        instructions: [
            'Kalbsschnitzel zwischen Frischhaltefolie etwa 4–5 mm dünn plattieren und von beiden Seiten salzen.',
            'Drei tiefe Teller vorbereiten: Mehl in den ersten, leicht verschlagene Eier in den zweiten, Paniermehl in den dritten.',
            'Schnitzel erst in Mehl wenden und abklopfen, dann durch das Ei ziehen und zuletzt leicht im Paniermehl wenden.',
            'Butterschmalz in einer großen Pfanne erhitzen, sodass die Schnitzel darin schwimmen können.',
            'Schnitzel im heißen Fett goldbraun ausbacken und die Pfanne leicht bewegen. Nach 2–3 Minuten wenden.',
            'Auf Küchenpapier abtropfen lassen und sofort mit Zitronenspalten servieren.'
        ],
        nutritionIngredients: []
    }
];

module.exports = communityRecipes;
