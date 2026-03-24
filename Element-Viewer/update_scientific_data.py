import json
import re
import os

# ==============================================================================
# PLACEHOLDER PARA O JSON DE PONTO CRÍTICO
# ==============================================================================

JSON_DATA = """
{
  "Elementos": {
    "Hydrogen": {
      "Temperatura_Critica": "33.19 K_141",
      "Pressao_Critica": "1.315 MPa_141"
    },
    "Helium": {
      "Temperatura_Critica": "5.19 K_141",
      "Pressao_Critica": "2.29 bar_141"
    },
    "Lithium": {
      "Temperatura_Critica": "3223 K_141",
      "Pressao_Critica": "N/A"
    },
    "Beryllium": {
      "Temperatura_Critica": "13000 K_141*",
      "Pressao_Critica": "0.7 GPa_141*"
    },
    "Boron": {
      "Temperatura_Critica": "3284 K_141",
      "Pressao_Critica": "N/A"
    },
    "Carbon": {
      "Temperatura_Critica": "6743 K_141",
      "Pressao_Critica": "N/A"
    },
    "Nitrogen": {
      "Temperatura_Critica": "126.192 ± 0.010 K_141",
      "Pressao_Critica": "3.3958 ± 0.0017 MPa_141"
    },
    "Oxygen": {
      "Temperatura_Critica": "154.581 K_141",
      "Pressao_Critica": "5.043 MPa_141"
    },
    "Fluorine": {
      "Temperatura_Critica": "144.32 ± 0.05 K_141",
      "Pressao_Critica": "5.215 MPa_141"
    },
    "Neon": {
      "Temperatura_Critica": "44.4 K_141",
      "Pressao_Critica": "N/A"
    },
    "Sodium": {
      "Temperatura_Critica": "2573 K_141",
      "Pressao_Critica": "N/A"
    },
    "Magnesium": {
      "Temperatura_Critica": "2535 K_141",
      "Pressao_Critica": "N/A"
    },
    "Aluminium": {
      "Temperatura_Critica": "8550 K_141",
      "Pressao_Critica": "N/A"
    },
    "Silicon": {
      "Temperatura_Critica": "5159 K_141",
      "Pressao_Critica": "N/A"
    },
    "Phosphorus": {
      "Temperatura_Critica": "994.0 K_141",
      "Pressao_Critica": "N/A"
    },
    "Sulfur": {
      "Temperatura_Critica": "1314 K_141",
      "Pressao_Critica": "N/A"
    },
    "Chlorine": {
      "Temperatura_Critica": "416.956 K_141",
      "Pressao_Critica": "7.9914 MPa_141"
    },
    "Argon": {
      "Temperatura_Critica": "150.687 ± 0.015 K_141",
      "Pressao_Critica": "4.863 ± 0.003 MPa_141"
    },
    "Potassium": {
      "Temperatura_Critica": "2223 K_141",
      "Pressao_Critica": "N/A"
    },
    "Calcium": {
      "Temperatura_Critica": "2880 K_141",
      "Pressao_Critica": "N/A"
    },
    "Scandium": {
      "Temperatura_Critica": "5400 K_141",
      "Pressao_Critica": "N/A"
    },
    "Titanium": {
      "Temperatura_Critica": "15500 K_141*",
      "Pressao_Critica": "0.7 GPa_141*"
    },
    "Vanadium": {
      "Temperatura_Critica": "5930 K_141",
      "Pressao_Critica": "N/A"
    },
    "Chromium": {
      "Temperatura_Critica": "4700 K_141",
      "Pressao_Critica": "N/A"
    },
    "Manganese": {
      "Temperatura_Critica": "4327 K_141",
      "Pressao_Critica": "N/A"
    },
    "Iron": {
      "Temperatura_Critica": "9250 K_141",
      "Pressao_Critica": "8750 bar_141"
    },
    "Cobalt": {
      "Temperatura_Critica": "5400 K_141",
      "Pressao_Critica": "N/A"
    },
    "Nickel": {
      "Temperatura_Critica": "6000 K_141*",
      "Pressao_Critica": "0.29 GPa_141*"
    },
    "Copper": {
      "Temperatura_Critica": "5421 K_141",
      "Pressao_Critica": "N/A"
    },
    "Zinc": {
      "Temperatura_Critica": "3380 K_141",
      "Pressao_Critica": "N/A"
    },
    "Gallium": {
      "Temperatura_Critica": "7620 K_141",
      "Pressao_Critica": "N/A"
    },
    "Germanium": {
      "Temperatura_Critica": "8400 K_141",
      "Pressao_Critica": "N/A"
    },
    "Arsenic": {
      "Temperatura_Critica": "2100 K_141",
      "Pressao_Critica": "N/A"
    },
    "Selenium": {
      "Temperatura_Critica": "1757 K_141",
      "Pressao_Critica": "N/A"
    },
    "Bromine": {
      "Temperatura_Critica": "584 K_141",
      "Pressao_Critica": "N/A"
    },
    "Krypton": {
      "Temperatura_Critica": "209.4 K_141",
      "Pressao_Critica": "N/A"
    },
    "Rubidium": {
      "Temperatura_Critica": "2093 K_141",
      "Pressao_Critica": "N/A"
    },
    "Strontium": {
      "Temperatura_Critica": "3059 K_141",
      "Pressao_Critica": "N/A"
    },
    "Yttrium": {
      "Temperatura_Critica": "8950 K_141",
      "Pressao_Critica": "N/A"
    },
    "Zirconium": {
      "Temperatura_Critica": "8650 K_141",
      "Pressao_Critica": "N/A"
    },
    "Niobium": {
      "Temperatura_Critica": "8700 K_141",
      "Pressao_Critica": "N/A"
    },
    "Molybdenum": {
      "Temperatura_Critica": "9450 K_141",
      "Pressao_Critica": "N/A"
    },
    "Technetium": {
      "Temperatura_Critica": "11500 K_141",
      "Pressao_Critica": "N/A"
    },
    "Ruthenium": {
      "Temperatura_Critica": "9600 K_141",
      "Pressao_Critica": "N/A"
    },
    "Rhodium": {
      "Temperatura_Critica": "7000 K_141",
      "Pressao_Critica": "N/A"
    },
    "Palladium": {
      "Temperatura_Critica": "7100 K_141",
      "Pressao_Critica": "N/A"
    },
    "Silver": {
      "Temperatura_Critica": "7480 K_141",
      "Pressao_Critica": "N/A"
    },
    "Cadmium": {
      "Temperatura_Critica": "2960 K_141",
      "Pressao_Critica": "N/A"
    },
    "Indium": {
      "Temperatura_Critica": "6730 K_141",
      "Pressao_Critica": "N/A"
    },
    "Tin": {
      "Temperatura_Critica": "5809 K_141",
      "Pressao_Critica": "N/A"
    },
    "Antimony": {
      "Temperatura_Critica": "5070 K_141",
      "Pressao_Critica": "N/A"
    },
    "Tellurium": {
      "Temperatura_Critica": "2329 K_141",
      "Pressao_Critica": "N/A"
    },
    "Iodine": {
      "Temperatura_Critica": "819 K_141",
      "Pressao_Critica": "N/A"
    },
    "Xenon": {
      "Temperatura_Critica": "289.765 ± 0.025 K_141*",
      "Pressao_Critica": "5.8405 ± 0.0005 MPa_141*"
    },
    "Caesium": {
      "Temperatura_Critica": "1938 ± 10 K_141",
      "Pressao_Critica": "9.4 ± 0.2 MPa_141"
    },
    "Barium": {
      "Temperatura_Critica": "3270 K_141",
      "Pressao_Critica": "N/A"
    },
    "Lanthanum": {
      "Temperatura_Critica": "10500 K_141",
      "Pressao_Critica": "N/A"
    },
    "Cerium": {
      "Temperatura_Critica": "10400 K_141",
      "Pressao_Critica": "N/A"
    },
    "Praseodymium": {
      "Temperatura_Critica": "8900 K_141",
      "Pressao_Critica": "N/A"
    },
    "Neodymium": {
      "Temperatura_Critica": "7900 K_141",
      "Pressao_Critica": "N/A"
    },
    "Promethium": {
      "Temperatura_Critica": "6800 K_141",
      "Pressao_Critica": "N/A"
    },
    "Samarium": {
      "Temperatura_Critica": "5440 K_141",
      "Pressao_Critica": "N/A"
    },
    "Europium": {
      "Temperatura_Critica": "4600 K_141",
      "Pressao_Critica": "N/A"
    },
    "Gadolinium": {
      "Temperatura_Critica": "8670 K_141",
      "Pressao_Critica": "N/A"
    },
    "Terbium": {
      "Temperatura_Critica": "8470 K_141",
      "Pressao_Critica": "N/A"
    },
    "Dysprosium": {
      "Temperatura_Critica": "7640 K_141",
      "Pressao_Critica": "N/A"
    },
    "Holmium": {
      "Temperatura_Critica": "7570 K_141",
      "Pressao_Critica": "N/A"
    },
    "Erbium": {
      "Temperatura_Critica": "7250 K_141",
      "Pressao_Critica": "N/A"
    },
    "Thulium": {
      "Temperatura_Critica": "6430 K_141",
      "Pressao_Critica": "N/A"
    },
    "Ytterbium": {
      "Temperatura_Critica": "4420 K_141",
      "Pressao_Critica": "N/A"
    },
    "Lutetium": {
      "Temperatura_Critica": "3540 K_141",
      "Pressao_Critica": "N/A"
    },
    "Hafnium": {
      "Temperatura_Critica": "10400 K_141",
      "Pressao_Critica": "N/A"
    },
    "Tantalum": {
      "Temperatura_Critica": "10250 K_141",
      "Pressao_Critica": "N/A"
    },
    "Tungsten": {
      "Temperatura_Critica": "22500 K_141*",
      "Pressao_Critica": "1.6 GPa_141*"
    },
    "Rhenium": {
      "Temperatura_Critica": "20500 K_141",
      "Pressao_Critica": "N/A"
    },
    "Osmium": {
      "Temperatura_Critica": "12700 K_141",
      "Pressao_Critica": "N/A"
    },
    "Iridium": {
      "Temperatura_Critica": "7800 K_141",
      "Pressao_Critica": "N/A"
    },
    "Platinum": {
      "Temperatura_Critica": "8450 K_141",
      "Pressao_Critica": "N/A"
    },
    "Gold": {
      "Temperatura_Critica": "6200 K_141*",
      "Pressao_Critica": "0.45 GPa_141*"
    },
    "Mercury": {
      "Temperatura_Critica": "1750 K_319",
      "Pressao_Critica": "172.00 MPa_319"
    },
    "Thallium": {
      "Temperatura_Critica": "2329 K_141",
      "Pressao_Critica": "N/A"
    },
    "Lead": {
      "Temperatura_Critica": "5400 K_141",
      "Pressao_Critica": "N/A"
    },
    "Bismuth": {
      "Temperatura_Critica": "4620 K_141",
      "Pressao_Critica": "N/A"
    },
    "Polonium": {
      "Temperatura_Critica": "2880 K_141",
      "Pressao_Critica": "N/A"
    },
    "Astatine": {
      "Temperatura_Critica": "1060 K_141",
      "Pressao_Critica": "N/A"
    },
    "Radon": {
      "Temperatura_Critica": "377.0 K_141",
      "Pressao_Critica": "N/A"
    },
    "Francium": {
      "Temperatura_Critica": "2030 K_141",
      "Pressao_Critica": "N/A"
    },
    "Radium": {
      "Temperatura_Critica": "3510 K_141",
      "Pressao_Critica": "N/A"
    },
    "Actinium": {
      "Temperatura_Critica": "16270 K_141",
      "Pressao_Critica": "N/A"
    },
    "Thorium": {
      "Temperatura_Critica": "14550 K_141",
      "Pressao_Critica": "N/A"
    },
    "Protactinium": {
      "Temperatura_Critica": "14000 K_141",
      "Pressao_Critica": "N/A"
    },
    "Uranium": {
      "Temperatura_Critica": "12500 K_141",
      "Pressao_Critica": "N/A"
    },
    "Neptunium": {
      "Temperatura_Critica": "12000 K_141",
      "Pressao_Critica": "N/A"
    },
    "Plutonium": {
      "Temperatura_Critica": "11140 K_141",
      "Pressao_Critica": "N/A"
    },
    "Americium": {
      "Temperatura_Critica": "10800 K_141",
      "Pressao_Critica": "N/A"
    },
    "Curium": {
      "Temperatura_Critica": "N/A",
      "Pressao_Critica": "N/A"
    },
    "Berkelium": {
      "Temperatura_Critica": "N/A",
      "Pressao_Critica": "N/A"
    },
    "Californium": {
      "Temperatura_Critica": "N/A",
      "Pressao_Critica": "N/A"
    },
    "Einsteinium": {
      "Temperatura_Critica": "N/A",
      "Pressao_Critica": "N/A"
    },
    "Fermium": {
      "Temperatura_Critica": "N/A",
      "Pressao_Critica": "N/A"
    },
    "Mendelevium": {
      "Temperatura_Critica": "N/A",
      "Pressao_Critica": "N/A"
    },
    "Nobelium": {
      "Temperatura_Critica": "N/A",
      "Pressao_Critica": "N/A"
    },
    "Lawrencium": {
      "Temperatura_Critica": "N/A",
      "Pressao_Critica": "N/A"
    },
    "Rutherfordium": {
      "Temperatura_Critica": "N/A",
      "Pressao_Critica": "N/A"
    },
    "Dubnium": {
      "Temperatura_Critica": "N/A",
      "Pressao_Critica": "N/A"
    },
    "Seaborgium": {
      "Temperatura_Critica": "N/A",
      "Pressao_Critica": "N/A"
    },
    "Bohrium": {
      "Temperatura_Critica": "N/A",
      "Pressao_Critica": "N/A"
    },
    "Hassium": {
      "Temperatura_Critica": "N/A",
      "Pressao_Critica": "N/A"
    },
    "Meitnerium": {
      "Temperatura_Critica": "N/A",
      "Pressao_Critica": "N/A"
    },
    "Darmstadtium": {
      "Temperatura_Critica": "N/A",
      "Pressao_Critica": "N/A"
    },
    "Roentgenium": {
      "Temperatura_Critica": "N/A",
      "Pressao_Critica": "N/A"
    },
    "Copernicium": {
      "Temperatura_Critica": "N/A",
      "Pressao_Critica": "N/A"
    },
    "Nihonium": {
      "Temperatura_Critica": "N/A",
      "Pressao_Critica": "N/A"
    },
    "Flerovium": {
      "Temperatura_Critica": "N/A",
      "Pressao_Critica": "N/A"
    },
    "Moscovium": {
      "Temperatura_Critica": "N/A",
      "Pressao_Critica": "N/A"
    },
    "Livermorium": {
      "Temperatura_Critica": "N/A",
      "Pressao_Critica": "N/A"
    },
    "Tennessine": {
      "Temperatura_Critica": "N/A",
      "Pressao_Critica": "N/A"
    },
    "Oganesson": {
      "Temperatura_Critica": "N/A",
      "Pressao_Critica": "N/A"
    }
  }
}
"""

# ==============================================================================
# LÓGICA DO SCRIPT
# ==============================================================================

ELEMENT_MAP = {
    'Hydrogen': 'H', 'Helium': 'He', 'Lithium': 'Li', 'Beryllium': 'Be', 'Boron': 'B',
    'Carbon': 'C', 'Nitrogen': 'N', 'Oxygen': 'O', 'Fluorine': 'F', 'Neon': 'Ne',
    'Sodium': 'Na', 'Magnesium': 'Mg', 'Aluminium': 'Al', 'Aluminum': 'Al', 'Silicon': 'Si',
    'Phosphorus': 'P', 'Sulfur': 'S', 'Chlorine': 'Cl', 'Argon': 'Ar', 'Potassium': 'K',
    'Calcium': 'Ca', 'Scandium': 'Sc', 'Titanium': 'Ti', 'Vanadium': 'V', 'Chromium': 'Cr',
    'Manganese': 'Mn', 'Iron': 'Fe', 'Cobalt': 'Co', 'Nickel': 'Ni', 'Copper': 'Cu',
    'Zinc': 'Zn', 'Gallium': 'Ga', 'Germanium': 'Ge', 'Arsenic': 'As', 'Selenium': 'Se',
    'Bromine': 'Br', 'Krypton': 'Kr', 'Rubidium': 'Rb', 'Strontium': 'Sr', 'Yttrium': 'Y',
    'Zirconium': 'Zr', 'Niobium': 'Nb', 'Molybdenum': 'Mo', 'Technetium': 'Tc', 'Ruthenium': 'Ru',
    'Rhodium': 'Rh', 'Palladium': 'Pd', 'Silver': 'Ag', 'Cadmium': 'Cd', 'Indium': 'In',
    'Tin': 'Sn', 'Antimony': 'Sb', 'Tellurium': 'Te', 'Iodine': 'I', 'Xenon': 'Xe',
    'Caesium': 'Cs', 'Cesium': 'Cs', 'Barium': 'Ba', 'Lanthanum': 'La', 'Cerium': 'Ce',
    'Praseodymium': 'Pr', 'Neodymium': 'Nd', 'Promethium': 'Pm', 'Samarium': 'Sm', 'Europium': 'Eu',
    'Gadolinium': 'Gd', 'Terbium': 'Tb', 'Dysprosium': 'Dy', 'Holmium': 'Ho', 'Erbium': 'Er',
    'Thulium': 'Tm', 'Ytterbium': 'Yb', 'Lutetium': 'Lu', 'Hafnium': 'Hf', 'Tantalum': 'Ta',
    'Tungsten': 'W', 'Rhenium': 'Re', 'Osmium': 'Os', 'Iridium': 'Ir', 'Platinum': 'Pt',
    'Gold': 'Au', 'Mercury': 'Hg', 'Thallium': 'Tl', 'Lead': 'Pb', 'Bismuth': 'Bi',
    'Polonium': 'Po', 'Astatine': 'At', 'Radon': 'Rn', 'Francium': 'Fr', 'Radium': 'Ra',
    'Actinium': 'Ac', 'Thorium': 'Th', 'Protactinium': 'Pa', 'Uranium': 'U', 'Neptunium': 'Np',
    'Plutonium': 'Pu', 'Americium': 'Am', 'Curium': 'Cm', 'Berkelium': 'Bk', 'Californium': 'Cf',
    'Einsteinium': 'Es', 'Fermium': 'Fm', 'Mendelevium': 'Md', 'Nobelium': 'No', 'Lawrencium': 'Lr',
    'Rutherfordium': 'Rf', 'Dubnium': 'Db', 'Seaborgium': 'Sg', 'Bohrium': 'Bh', 'Hassium': 'Hs',
    'Meitnerium': 'Mt', 'Darmstadtium': 'Ds', 'Roentgenium': 'Rg', 'Copernicium': 'Cn', 'Nihonium': 'Nh',
    'Flerovium': 'Fl', 'Moscovium': 'Mc', 'Livermorium': 'Lv', 'Tennessine': 'Ts', 'Oganesson': 'Og'
}

def parse_critical_value(raw_val, is_pressure=False):
    if raw_val == "N/A" or not raw_val.strip():
        return "N/A"

    has_ast = '*' in raw_val
    
    # Mapeamento do sufixo conforme a regra
    suffix = ""
    if "_141" in raw_val:
        suffix = "_19"
    elif "_319" in raw_val:
        suffix = "_1"
        
    # Extrai o primeiro número (para antes de ± ou espaço)
    num_match = re.search(r"^([\d\.]+)", raw_val.strip())
    if not num_match:
        return "N/A"
    
    num = num_match.group(1)
    ast_str = "*" if has_ast else ""
    
    # Para a temperatura (tCriticalK), retornamos só a string simples formatada
    if not is_pressure:
        return f"{num}{ast_str}{suffix}"
    else:
        # Para a pressão (pCritical), capturamos a unidade (letras coladas antes do '_')
        unit_match = re.search(r"([A-Za-z]+)_", raw_val)
        unit = unit_match.group(1) if unit_match else ""
        
        return {
            "value": f"{num}{ast_str}{suffix}",
            "unit": unit
        }

def main():
    try:
        data = json.loads(JSON_DATA)
        elementos = data.get("Elementos", {})
    except json.JSONDecodeError:
        print("Erro: O JSON fornecido é inválido.")
        return

    ts_file_path = r"D:\NOAH\Área de Trabalho\Tudo\Noah\Renda Extra\element viewer\element-viewer-mcp\Element-Viewer\scientific_data.ts"
    
    if not os.path.exists(ts_file_path):
        print(f"Erro: O arquivo '{ts_file_path}' não foi encontrado.")
        return

    with open(ts_file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    for elem_name, props in elementos.items():
        sym = ELEMENT_MAP.get(elem_name)
        if not sym:
            continue

        raw_tcrit = props.get("Temperatura_Critica", "N/A")
        raw_pcrit = props.get("Pressao_Critica", "N/A")

        v_tcrit = parse_critical_value(raw_tcrit, is_pressure=False)
        v_pcrit = parse_critical_value(raw_pcrit, is_pressure=True)

        # Trata o formato do pCritical
        if isinstance(v_pcrit, dict):
            pcrit_json = (
                f"{{\n"
                f"      \"value\": \"{v_pcrit['value']}\",\n"
                f"      \"unit\": \"{v_pcrit['unit']}\"\n"
                f"    }}"
            )
        else:
            pcrit_json = f"\"{v_pcrit}\""

        # Encontra o bloco do elemento
        start_match = re.search(rf'\n\s+"{sym}":\s*\{{', content)
        if not start_match: 
            continue

        start_idx = start_match.end() - 1
        brace_count = 0
        end_idx = -1

        for i in range(start_idx, len(content)):
            if content[i] == '{':
                brace_count += 1
            elif content[i] == '}':
                brace_count -= 1
                if brace_count == 0:
                    end_idx = i
                    break

        if end_idx != -1:
            last_char_idx = end_idx - 1
            while last_char_idx > start_idx and content[last_char_idx].isspace():
                last_char_idx -= 1

            prefix_comma = "," if content[last_char_idx] not in [',', '{'] else ""

            # Injeção das novas propriedades mantendo a indentação
            new_props = (
                f"{prefix_comma}\n"
                f"    \"tCriticalK\": \"{v_tcrit}\",\n"
                f"    \"pCritical\": {pcrit_json}\n"
                f"  "
            )

            content = content[:end_idx] + new_props + content[end_idx:]

    with open(ts_file_path, 'w', encoding='utf-8') as f:
        f.write(content)

    print("✅ scientific_data.ts atualizado: dados de Ponto Crítico (tCriticalK e pCritical) injetados com sucesso!")

if __name__ == "__main__":
    main()