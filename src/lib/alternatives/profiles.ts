// Profile for preliminary luminaire candidates, not a guarantee of interchangeability.
// Flux, diffuser, dimensions not present in this profile must be reviewed by the buyer.
export const indoorE27Profile = {
  category: "Светильники для внутреннего освещения",
  requiredProperties: ["TIP_TSOKOLYA", "SPOSOB_MONTAZHA", "TIP_ISTOCHNIKA", "MATERIAL_KORPUSA",
    "TIP_SVETILNIKA", "TEXT_LAMP_COUNT", "TEXT_DIAMETER_MM", "TEXT_IP_RATING"],
};

export const propertyLabels: Record<string, string> = {
  NOMINALNYY_TOK: "Номинальный ток", BRAND: "Бренд", TORGOVAYA_MARKA: "Бренд",
  TIP_TSOKOLYA: "Цоколь", SPOSOB_MONTAZHA: "Монтаж", TIP_ISTOCHNIKA: "Источник света",
  MATERIAL_KORPUSA: "Материал корпуса", TIP_SVETILNIKA: "Тип светильника",
  TEXT_LAMP_COUNT: "Количество ламп", TEXT_DIAMETER_MM: "Диаметр, мм", TEXT_IP_RATING: "Степень защиты",
  SVETOVOY_POTOK_LM: "Световой поток, лм", TIP_RASSEIVATELYA_: "Рассеиватель",
  TSVET_KORPUSA: "Цвет корпуса", FORMA_LAMPY: "Форма лампы",
};
