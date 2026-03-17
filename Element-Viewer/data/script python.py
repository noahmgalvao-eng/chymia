import json
import os

def process_periodic_table():
    # Descobre o diretório exato onde este script Python está salvo
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Monta os caminhos absolutos garantindo que tudo ocorra na mesma pasta
    input_file = os.path.join(script_dir, 'periodic_table_source.ts')
    output_file = os.path.join(script_dir, 'periodic_table_filtered.ts')

    print(f"Procurando o arquivo em: {input_file}")

    if not os.path.exists(input_file):
        print("\nErro: O arquivo ainda não foi encontrado.")
        print("Verifique se o nome do arquivo original é exatamente 'periodic_table_source.ts' (cuidado com extensões ocultas como .ts.txt).")
        return

    # 1. Ler o arquivo .ts original
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # 2. Extrair apenas a parte do JSON (entre o primeiro '{' e o último '}')
    start_idx = content.find('{')
    end_idx = content.rfind('}') + 1
    
    if start_idx == -1 or end_idx == 0:
        print("Erro: Não foi possível encontrar a estrutura JSON no arquivo.")
        return
        
    json_str = content[start_idx:end_idx]

    # 3. Converter a string JSON para um dicionário Python
    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as e:
        print(f"Erro ao processar o JSON: {e}")
        return

    # 4. Criar uma nova lista filtrando apenas as propriedades desejadas
    filtered_elements = []
    for element in data.get("elements", []):
        filtered_elements.append({
            "name": element.get("name"),
            "symbol": element.get("symbol"),
            "category": element.get("category"),
            "summary": element.get("summary")
        })

    # 5. Montar o novo objeto com a lista filtrada
    new_data = {
        "elements": filtered_elements
    }

    # 6. Converter de volta para string JSON formatada
    new_json_str = json.dumps(new_data, indent=4, ensure_ascii=False)

    # 7. Recriar a sintaxe de exportação do TypeScript
    final_output = f"export const SOURCE_DATA = {new_json_str};\n"

    # 8. Salvar no novo arquivo
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(final_output)

    print(f"\nSucesso! O arquivo filtrado foi salvo em:\n{output_file}")

# Executar o script
if __name__ == "__main__":
    process_periodic_table()