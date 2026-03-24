import re
import os

# Caminho fixo do seu projeto
FILE_PATH = r"D:\NOAH\Área de Trabalho\Tudo\Noah\Renda Extra\element viewer\element-viewer-mcp\Element-Viewer\data\scientific_data.ts"

def main():
    if not os.path.exists(FILE_PATH):
        print(f"Erro: O arquivo não foi encontrado em {FILE_PATH}")
        return

    with open(FILE_PATH, "r", encoding="utf-8") as f:
        lines = f.readlines()

    out_lines = []
    in_phase_temperatures = False
    block_lines = []
    current_element = ""
    
    # Chaves exatas que queremos APAGAR (sem unidade no nome)
    KEYS_TO_REMOVE = {
        "criticalTemperature", 
        "criticalPressure"
    }

    print("Iniciando a limpeza. Registrando os itens removidos:")

    for line in lines:
        # Pega o nome do elemento para o registro no terminal
        match_elem = re.match(r'^\s*"([A-Z][a-z]?)":\s*\{', line)
        if match_elem:
            current_element = match_elem.group(1)

        if '"phaseTemperatures": {' in line:
            in_phase_temperatures = True
            out_lines.append(line)
            block_lines = []
            continue

        if in_phase_temperatures:
            if re.match(r'^\s*\}', line):
                filtered_block = []
                
                # Varre as propriedades do bloco
                for bline in block_lines:
                    match = re.search(r'^\s*"([^"]+)"\s*:', bline)
                    if match:
                        key = match.group(1)
                        if key in KEYS_TO_REMOVE:
                            # Deixa um registro visual no terminal do que está sendo apagado
                            print(f" - Apagando '{key}' do elemento [{current_element}]")
                            continue # Pula a linha, efetivamente apagando ela
                        else:
                            filtered_block.append(bline)
                    else:
                        filtered_block.append(bline)

                # Arruma as vírgulas do bloco para o TypeScript não dar erro
                for j in range(len(filtered_block)):
                    # Remove vírgula do final (se houver) para padronizar
                    filtered_block[j] = re.sub(r',\s*(\n)?$', r'\1', filtered_block[j])
                    
                    # Adiciona a vírgula de volta em todas, exceto na última propriedade
                    if j < len(filtered_block) - 1:
                        filtered_block[j] = filtered_block[j].rstrip('\n') + ',\n'

                out_lines.extend(filtered_block)
                out_lines.append(line)
                in_phase_temperatures = False
            else:
                block_lines.append(line)
        else:
            out_lines.append(line)

    # Salva o arquivo final
    with open(FILE_PATH, "w", encoding="utf-8") as f:
        f.writelines(out_lines)

    print(f"\nConcluído! O arquivo {FILE_PATH} foi atualizado.")

if __name__ == "__main__":
    main()