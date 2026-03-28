import {expect2xx, HttpClient, TestFixture} from "./client";


export class SearchClient extends HttpClient {

    constructor(app: TestFixture, accessToken: string) {
        super(app, accessToken);
    }

    public async findTenantBy(query: any) {
        return this.searchApi("Tenants", query);
    }

    async findByUser(query: any) {
        return this.searchApi("Users", query);
    }

    private convertToCriteria(query: any) {
        const searchCriteria = [];
        for (let key in query) {
            searchCriteria.push({
                field: key,
                label: key,
                value: query[key],
                operator: "equals"
            })
        }
        return searchCriteria;
    }

    private async searchApi(entity: string, query: any) {
        let where = this.convertToCriteria(query);
        const response = await this.post(`/api/search/${entity}`)
            .send({
                pageNo: 0,
                pageSize: 50,
                where: where
            });

        console.log(response.body);
        expect2xx(response);
        expect(response.body.data.length).toBeGreaterThanOrEqual(1);
        return response.body.data[0];
    }
}
